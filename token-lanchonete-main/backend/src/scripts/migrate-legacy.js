// Migra os dados antigos (SQLite + arquivos JSON) para o PostgreSQL, sem alterar nem apagar arquivos antigos.
//
//   npm run db:migrate-legacy --workspace backend            migra e valida
//   npm run db:migrate-legacy --workspace backend -- --dry-run   só mostra o que seria migrado
//   npm run db:migrate-legacy --workspace backend -- --force     repete a importação (ignora registros que já existem)
//
// Fontes (por ordem de prioridade): data/token-pedidos.sqlite (dados mais recentes) e data/*.json (complemento).
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCESS_LOG_FILE, ACCOUNT_FILE, DATA_FILE, LEGACY_SQLITE_FILE, PRODUCTS_FILE, USERS_FILE } from "../config.js";
import { closePool, query, queryOne, runMigrations, transaction } from "../database.js";
import { recalculateAccount } from "../services/accountService.js";
import { LEGACY_IMPORT_MARKER } from "../services/bootstrapService.js";
import { fromCents, toCents } from "../utils/money.js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const warnings = [];
const warn = message => { warnings.push(message); console.warn(`  ! ${message}`); };

// ------------------------------------------------------------------ leitura das fontes

function readJson(file) {
  const target = fileURLToPath(file);
  if (!existsSync(target)) return [];
  try { return JSON.parse(readFileSync(target, "utf8") || "[]"); } catch (error) { warn(`${path.basename(target)} ilegível: ${error.message}`); return []; }
}

async function readSqlite() {
  const source = fileURLToPath(LEGACY_SQLITE_FILE);
  if (!existsSync(source)) return null;
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch {
    warn("Este Node.js não tem o módulo node:sqlite (use Node 22.13 ou mais novo). O SQLite NÃO foi lido; apenas os JSON serão migrados, e eles podem estar desatualizados.");
    return null;
  }
  // Trabalha em uma CÓPIA (inclusive do arquivo -wal) para nunca alterar os arquivos originais.
  const temp = mkdtempSync(path.join(tmpdir(), "legacy-sqlite-"));
  try {
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(source + suffix)) copyFileSync(source + suffix, path.join(temp, `legacy.sqlite${suffix}`));
    const db = new DatabaseSync(path.join(temp, "legacy.sqlite"));
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    const read = table => (tables.has(table) ? db.prepare(`SELECT * FROM ${table}`).all() : []);
    const data = {
      users: read("users"), access_logs: read("access_logs"), products: read("products"),
      account_entries: read("account_entries"), orders: read("orders"), audit_events: read("audit_events")
    };
    db.close();
    return data;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const mergeById = (primary, secondary) => {
  const map = new Map(primary.map(row => [row.id, row]));
  for (const row of secondary) if (!map.has(row.id)) map.set(row.id, row);
  return [...map.values()];
};

function toDate(value, label) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) { warn(`Data inválida em ${label}; usando a data atual.`); return new Date(); }
  return date;
}

function normalize(sqlite, json) {
  const s = sqlite || {};
  const users = mergeById(
    (s.users || []).map(u => ({ id: u.id, name: u.name, cpf: u.cpf, birthDate: u.birth_date, phone: u.phone, email: String(u.email).toLowerCase(), role: u.role, passwordHash: u.password_hash, salt: u.salt, emailVerified: u.email_verified ?? 1, createdAt: u.created_at })),
    json.users.map(u => ({ ...u, email: String(u.email).toLowerCase(), emailVerified: 1 }))
  );
  const products = mergeById(
    (s.products || []).map(p => ({ id: p.id, name: p.name, description: p.description, price: p.price, image: p.image, createdAt: p.created_at, updatedAt: p.updated_at })),
    json.products
  );
  const entries = mergeById(
    (s.account_entries || []).map(e => ({ id: e.id, userId: e.user_id, name: e.name, price: e.price, quantity: e.quantity, month: e.month, addedAt: e.added_at })),
    json.accounts
  );
  const accessLogs = mergeById(
    (s.access_logs || []).map(a => ({ id: a.id, userId: a.user_id, name: a.name, email: a.email, role: a.role, accessedAt: a.accessed_at, ip: a.ip })),
    json.accessLogs
  );
  const orders = mergeById(
    (s.orders || []).map(o => ({ id: o.id, token: o.token, customer: o.customer, items: safeParse(o.items_json), total: o.total, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at })),
    json.orders
  );
  const auditEvents = (s.audit_events || []).map(e => ({ id: e.id, userId: e.user_id, action: e.action, entity: e.entity, entityId: e.entity_id, details: e.details_json, createdAt: e.created_at }));
  return { users, products, entries, accessLogs, orders, auditEvents };
}

function safeParse(text) { try { return JSON.parse(text || "[]"); } catch { return []; } }
const deterministicId = seed => { const h = createHash("sha256").update(seed).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const price2 = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) { warn(`Valor inválido em ${label}: ${value}; usando 0.`); return 0; }
  if (Math.abs(number * 100 - Math.round(number * 100)) > 1e-6) warn(`Valor com mais de 2 casas em ${label} (${number}); arredondado.`);
  return fromCents(Math.round(number * 100));
};

// ------------------------------------------------------------------ importação

async function importAll(data, conn, stats) {
  const count = key => { stats[key] = stats[key] || { source: 0, inserted: 0, existing: 0 }; return stats[key]; };

  // usuários (preserva ids, hashes e salts: as senhas atuais continuam valendo)
  for (const user of data.users) {
    const c = count("users"); c.source += 1;
    if (await queryOne("SELECT id FROM users WHERE id = ?", [user.id], conn)) { c.existing += 1; continue; }
    const clash = await queryOne("SELECT id FROM users WHERE email = ?", [user.email], conn);
    if (clash) throw new Error(`O e-mail ${user.email} já existe no PostgreSQL com outro id (${clash.id}). Limpe o banco ou remova o usuário duplicado e rode de novo.`);
    await query(
      `INSERT INTO users (id, name, cpf, birth_date, phone, email, role, password_hash, salt, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.cpf, user.birthDate || "", user.phone || "", user.email, user.role === "admin" ? "admin" : "user", user.passwordHash, user.salt, Boolean(user.emailVerified), toDate(user.createdAt, `usuário ${user.email}`)], conn
    );
    c.inserted += 1;
  }

  for (const product of data.products) {
    const c = count("products"); c.source += 1;
    if (await queryOne("SELECT id FROM products WHERE id = ?", [product.id], conn)) { c.existing += 1; continue; }
    const created = toDate(product.createdAt, `produto ${product.name}`);
    await query("INSERT INTO products (id, name, description, price, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [product.id, product.name, product.description || "", price2(product.price, `produto ${product.name}`), product.image || "", created, product.updatedAt ? toDate(product.updatedAt, `produto ${product.name}`) : created], conn);
    c.inserted += 1;
  }

  for (const log of data.accessLogs) {
    const c = count("access_logs"); c.source += 1;
    if (await queryOne("SELECT id FROM access_logs WHERE id = ?", [log.id], conn)) { c.existing += 1; continue; }
    await query("INSERT INTO access_logs (id, user_id, name, email, role, accessed_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [log.id, log.userId, log.name, log.email, log.role, toDate(log.accessedAt, "registro de acesso"), log.ip || null], conn);
    c.inserted += 1;
  }

  // lançamentos da conta -> uma conta aberta por cliente, com um item para cada lançamento antigo
  const productsByName = new Map();
  for (const product of await query("SELECT id, name FROM products ORDER BY created_at", [], conn)) if (!productsByName.has(product.name)) productsByName.set(product.name, product.id);
  const byUser = new Map();
  for (const entry of data.entries) byUser.set(entry.userId, [...(byUser.get(entry.userId) || []), entry]);
  for (const [userId, entries] of byUser) {
    if (!(await queryOne("SELECT id FROM users WHERE id = ?", [userId], conn))) { warn(`Lançamentos ignorados: usuário ${userId} não existe.`); continue; }
    const accountId = deterministicId(`legacy-account:${userId}`);
    entries.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
    if (!(await queryOne("SELECT id FROM accounts WHERE id = ?", [accountId], conn))) {
      const opened = toDate(entries[0].addedAt, "abertura da conta");
      await query("INSERT INTO accounts (id, user_id, status, total_amount, paid_amount, opened_at, updated_at) VALUES (?, ?, 'open', 0, 0, ?, ?)", [accountId, userId, opened, opened], conn);
      count("accounts").inserted += 1;
    } else count("accounts").existing += 1;
    count("accounts").source += 1;
    for (const entry of entries) {
      const c = count("account_items"); c.source += 1;
      if (await queryOne("SELECT id FROM account_items WHERE id = ?", [entry.id], conn)) { c.existing += 1; continue; }
      const added = toDate(entry.addedAt, `lançamento ${entry.name}`);
      const quantity = Math.max(1, Math.trunc(Number(entry.quantity) || 1));
      await query(
        `INSERT INTO account_items (id, account_id, product_id, name, unit_price, quantity, note, status, added_by, added_by_role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'user', ?, ?)`,
        [entry.id, accountId, productsByName.get(entry.name) ?? null, entry.name, price2(entry.price, `lançamento ${entry.name}`), quantity, null, userId, added, added], conn
      );
      c.inserted += 1;
    }
    await recalculateAccount(conn, accountId);
  }

  for (const order of data.orders) {
    const c = count("orders"); c.source += 1;
    if (await queryOne("SELECT id FROM orders WHERE id = ?", [order.id], conn)) { c.existing += 1; continue; }
    const created = toDate(order.createdAt, `pedido ${order.token}`);
    await query("INSERT INTO orders (id, token, customer, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [order.id, String(order.token), order.customer || "Cliente", price2(order.total, `pedido ${order.token}`), order.status || "entregue", created, order.updatedAt ? toDate(order.updatedAt, `pedido ${order.token}`) : created], conn);
    for (const item of order.items || []) {
      await query("INSERT INTO order_items (order_id, name, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [order.id, item.name, Math.max(1, Math.trunc(Number(item.quantity) || 1)), price2(item.price, `item do pedido ${order.token}`)], conn);
    }
    c.inserted += 1;
  }

  // trilha de auditoria antiga preservada
  for (const event of data.auditEvents) {
    const c = count("audit_log"); c.source += 1;
    if (await queryOne("SELECT id FROM audit_log WHERE id = ?", [event.id], conn)) { c.existing += 1; continue; }
    await query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [event.id, event.userId, `legacy:${event.action}`, event.entity, event.entityId, event.details, toDate(event.createdAt, "evento de auditoria")], conn);
    c.inserted += 1;
  }
}

// ------------------------------------------------------------------ validação

async function validate(data) {
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`  ${ok ? "OK " : "ERRO"} ${name}${detail ? ` — ${detail}` : ""}`); };

  const countIn = async (table, ids) => {
    if (!ids.length) return 0;
    let found = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      found += Number((await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk)).n);
    }
    return found;
  };
  for (const [label, table, rows] of [["usuários", "users", data.users], ["produtos", "products", data.products], ["lançamentos de conta", "account_items", data.entries], ["acessos", "access_logs", data.accessLogs], ["pedidos", "orders", data.orders], ["eventos de auditoria", "audit_log", data.auditEvents]]) {
    const found = await countIn(table, rows.map(row => row.id));
    check(`${label}: ${rows.length} na origem, ${found} no PostgreSQL`, found === rows.length);
  }

  let hashesOk = true;
  for (const user of data.users) {
    const row = await queryOne("SELECT password_hash, salt, email FROM users WHERE id = ?", [user.id]);
    if (!row || row.password_hash !== user.passwordHash || row.salt !== user.salt || row.email !== user.email) hashesOk = false;
  }
  check("senhas (hash+salt) e e-mails idênticos aos originais", hashesOk);

  const expectedCents = data.entries.reduce((sum, entry) => sum + toCents(entry.price) * Math.max(1, Math.trunc(Number(entry.quantity) || 1)), 0);
  const actual = await queryOne(`SELECT COALESCE(SUM(line_total), 0) AS total FROM account_items WHERE id IN (${data.entries.length ? data.entries.map(() => "?").join(",") : "NULL"})`, data.entries.map(entry => entry.id));
  check(`valor total das contas confere (R$ ${(expectedCents / 100).toFixed(2)})`, toCents(actual.total) === expectedCents, `PostgreSQL: R$ ${Number(actual.total).toFixed(2)}`);

  const drift = await queryOne(
    `SELECT COUNT(*) AS n FROM accounts a WHERE ABS(a.total_amount - (SELECT COALESCE(SUM(i.line_total), 0) FROM account_items i WHERE i.account_id = a.id AND i.status = 'active')) > 0.001`
  );
  check("totais das contas = soma dos itens", Number(drift.n) === 0);
  return checks;
}

// ------------------------------------------------------------------ execução

try {
  console.log("1/4 Preparando tabelas no PostgreSQL...");
  await runMigrations(message => console.log(`  ${message}`));

  console.log("2/4 Lendo dados antigos...");
  const sqlite = await readSqlite();
  const json = { users: readJson(USERS_FILE), products: readJson(PRODUCTS_FILE), accounts: readJson(ACCOUNT_FILE), accessLogs: readJson(ACCESS_LOG_FILE), orders: readJson(DATA_FILE) };
  console.log(`  SQLite: ${sqlite ? "lido (cópia temporária)" : "não encontrado/lido"} | JSON: ${Object.values(json).reduce((n, rows) => n + rows.length, 0)} registros`);
  const data = normalize(sqlite, json);
  console.log(`  Total a migrar: ${data.users.length} usuários, ${data.products.length} produtos, ${data.entries.length} lançamentos de conta, ${data.accessLogs.length} acessos, ${data.orders.length} pedidos, ${data.auditEvents.length} eventos de auditoria`);

  if (DRY_RUN) {
    console.log("Modo --dry-run: nenhum dado foi gravado (apenas as tabelas vazias foram criadas).");
  } else {
    const alreadyDone = await queryOne("SELECT name FROM schema_migrations WHERE name = ?", [LEGACY_IMPORT_MARKER]);
    const stats = {};
    if (alreadyDone && !FORCE) {
      console.log("3/4 A importação já foi feita antes (use --force para repetir). Pulando para a validação.");
    } else {
      console.log("3/4 Importando (uma única transação: se algo falhar, nada é gravado)...");
      await transaction(conn => importAll(data, conn, stats));
      await query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET applied_at = EXCLUDED.applied_at", [LEGACY_IMPORT_MARKER, new Date()]);
      for (const [table, c] of Object.entries(stats)) console.log(`  ${table}: ${c.inserted} inseridos, ${c.existing} já existiam (origem: ${c.source})`);
    }

    console.log("4/4 Validando...");
    const checks = await validate(data);
    const failed = checks.filter(item => !item.ok);
    const report = { executedAt: new Date().toISOString(), forced: FORCE, stats, checks, warnings };
    writeFileSync(fileURLToPath(new URL("../../data/migration-report.json", import.meta.url)), JSON.stringify(report, null, 2));
    if (failed.length) {
      console.error(`\nMigração concluída COM DIVERGÊNCIAS (${failed.length}). Não apague os arquivos antigos.`);
      process.exitCode = 1;
    } else {
      console.log(`\nMigração validada com sucesso${warnings.length ? ` (${warnings.length} aviso(s))` : ""}. Os arquivos antigos foram mantidos intactos em backend/data/.`);
      console.log("Relatório salvo em backend/data/migration-report.json.");
    }
  }
} catch (error) {
  console.error(`\nA migração falhou e nada foi gravado: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
