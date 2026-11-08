import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../database.js";
import { HttpError, optionalText, pageParams, requireText } from "../utils/http.js";
import { dateRange, escapeLike } from "../utils/dates.js";
import { fromCents, parseQuantity, toCents } from "../utils/money.js";
import { audit, mapAudit } from "./auditService.js";

const money = value => Number(value || 0);

// ---------------------------------------------------------------- mapeamentos

export function mapAccount(row) {
  return {
    id: row.id, userId: row.user_id, userName: row.user_name, userEmail: row.user_email,
    status: row.status, totalAmount: money(row.total_amount), paidAmount: money(row.paid_amount), balance: money(row.balance),
    openedAt: row.opened_at, updatedAt: row.updated_at, closedAt: row.closed_at,
    itemCount: row.item_count === undefined ? undefined : Number(row.item_count), itemsSummary: row.items_summary ?? undefined
  };
}

function mapItem(row) {
  return {
    id: row.id, accountId: row.account_id, productId: row.product_id, name: row.name,
    unitPrice: money(row.unit_price), quantity: row.quantity, lineTotal: money(row.line_total), note: row.note,
    status: row.status, addedBy: row.added_by, addedByName: row.added_by_name, addedByRole: row.added_by_role,
    createdAt: row.created_at, updatedAt: row.updated_at, removedAt: row.removed_at, removedByName: row.removed_by_name,
    removalReason: row.removal_reason
  };
}

export function mapPayment(row) {
  return {
    id: row.id, accountId: row.account_id, userId: row.user_id, userName: row.user_name, userEmail: row.user_email,
    method: row.method_code, methodName: row.method_name ?? row.method_code, amount: money(row.amount), status: row.status,
    reference: row.reference, provider: row.provider, providerRef: row.provider_ref, pixPayload: row.pix_payload,
    expiresAt: row.expires_at, note: row.note, createdBy: row.created_by, createdByName: row.created_by_name,
    createdByRole: row.created_by_role, createdAt: row.created_at, confirmedAt: row.confirmed_at, confirmedByName: row.confirmed_by_name,
    refundedAt: row.refunded_at, refundedByName: row.refunded_by_name, refundReason: row.refund_reason
  };
}

/**
 * Cobertura dos pagamentos sobre os itens, na ordem em que foram lançados (primeiro lançado, primeiro pago).
 * Define quais itens estão "pagos", "parcialmente pagos" ou "pendentes".
 */
export function coverItems(items, paidAmount) {
  let remaining = toCents(paidAmount);
  return items.map(item => {
    if (item.status !== "active") return { ...item, paidAmount: 0, paymentStatus: "removed" };
    const line = toCents(item.lineTotal);
    const covered = Math.min(remaining, line);
    remaining -= covered;
    return { ...item, paidAmount: fromCents(covered), paymentStatus: covered === 0 ? "pending" : covered === line ? "paid" : "partial" };
  });
}

// ---------------------------------------------------------------- núcleo transacional

/** Bloqueia e devolve a conta (todas as operações financeiras de uma conta passam por este bloqueio). */
export async function lockAccount(conn, accountId) {
  const account = await queryOne("SELECT * FROM accounts WHERE id = ? FOR UPDATE", [accountId], conn);
  if (!account) throw new HttpError(404, "Conta não encontrada.");
  return account;
}

/** Conta aberta atual do cliente; cria uma nova se todas as anteriores já foram quitadas. */
export async function getOrCreateOpenAccount(conn, userId) {
  await query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId], conn); // serializa a criação de contas do mesmo cliente
  const existing = await queryOne(
    "SELECT * FROM accounts WHERE user_id = ? AND status <> 'paid' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE", [userId], conn
  );
  if (existing) return existing;
  const id = randomUUID();
  const now = new Date();
  await query("INSERT INTO accounts (id, user_id, status, total_amount, paid_amount, opened_at, updated_at) VALUES (?, ?, 'open', 0, 0, ?, ?)", [id, userId, now, now], conn);
  return queryOne("SELECT * FROM accounts WHERE id = ?", [id], conn);
}

/** Recalcula total, pago e situação SEMPRE a partir dos itens ativos e dos pagamentos confirmados. */
export async function recalculateAccount(conn, accountId) {
  const total = toCents((await queryOne("SELECT COALESCE(SUM(line_total), 0) AS v FROM account_items WHERE account_id = ? AND status = 'active'", [accountId], conn)).v);
  const paid = toCents((await queryOne("SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE account_id = ? AND status = 'confirmed'", [accountId], conn)).v);
  if (paid > total) throw new HttpError(409, "Operação recusada: o valor pago ficaria maior que o total da conta. Estorne um pagamento antes.");
  const status = paid === 0 ? "open" : paid >= total ? "paid" : "partial";
  const now = new Date();
  await query(
    "UPDATE accounts SET total_amount = ?, paid_amount = ?, status = ?, updated_at = ?, closed_at = CASE WHEN ? = 'paid' THEN COALESCE(closed_at, ?) ELSE NULL END WHERE id = ?",
    [fromCents(total), fromCents(paid), status, now, status, now, accountId], conn
  );
  return queryOne("SELECT * FROM accounts WHERE id = ?", [accountId], conn);
}

async function insertItem(conn, { account, product = null, name, unitPriceCents, quantity, note, actor, ip }) {
  const id = randomUUID();
  const now = new Date();
  await query(
    `INSERT INTO account_items (id, account_id, product_id, name, unit_price, quantity, note, status, added_by, added_by_role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [id, account.id, product?.id ?? null, name, fromCents(unitPriceCents), quantity, note, actor.id, actor.role, now, now], conn
  );
  const before = account.total_amount;
  const updated = await recalculateAccount(conn, account.id);
  await audit(conn, {
    actor, ip, action: "item-added", entity: "account_item", entityId: id, accountId: account.id,
    details: { name, quantity, unitPrice: fromCents(unitPriceCents), lineTotal: fromCents(unitPriceCents * quantity), note, previousTotal: money(before), newTotal: money(updated.total_amount) }
  });
  return { id, account: updated };
}

// ---------------------------------------------------------------- consultas

async function loadItems(accountId, conn) {
  const rows = await query(
    `SELECT i.*, ab.name AS added_by_name, rb.name AS removed_by_name
     FROM account_items i LEFT JOIN users ab ON ab.id = i.added_by LEFT JOIN users rb ON rb.id = i.removed_by
     WHERE i.account_id = ? ORDER BY i.created_at ASC, i.id ASC`, [accountId], conn
  );
  return rows.map(mapItem);
}

export async function loadPayments(accountId, conn) {
  const rows = await query(
    `SELECT p.*, m.name AS method_name, cb.name AS created_by_name, cf.name AS confirmed_by_name, rf.name AS refunded_by_name
     FROM payments p JOIN payment_methods m ON m.code = p.method_code
     LEFT JOIN users cb ON cb.id = p.created_by LEFT JOIN users cf ON cf.id = p.confirmed_by LEFT JOIN users rf ON rf.id = p.refunded_by
     WHERE p.account_id = ? ORDER BY p.created_at ASC`, [accountId], conn
  );
  return rows.map(mapPayment);
}

/** Conta completa: itens (com situação de pagamento), pagamentos e histórico de alterações. */
export async function getAccountDetail(accountId, { conn, includeHistory = true } = {}) {
  const row = await queryOne(
    "SELECT a.*, u.name AS user_name, u.email AS user_email FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = ?", [accountId], conn
  );
  if (!row) throw new HttpError(404, "Conta não encontrada.");
  const account = mapAccount(row);
  const items = coverItems(await loadItems(accountId, conn), account.paidAmount);
  const payments = await loadPayments(accountId, conn);
  const detail = { ...account, items, payments };
  if (includeHistory) {
    const rows = await query("SELECT * FROM audit_log WHERE account_id = ? ORDER BY created_at DESC LIMIT 200", [accountId], conn);
    detail.changes = rows.map(mapAudit);
  }
  return detail;
}

/** Garante que o cliente só enxergue as próprias contas (administradores enxergam todas). */
export async function getAccountDetailFor(user, accountId) {
  const detail = await getAccountDetail(accountId);
  if (user.role !== "admin" && detail.userId !== user.id) throw new HttpError(404, "Conta não encontrada.");
  return detail;
}

export async function getMyOpenAccounts(userId) {
  const rows = await query("SELECT id FROM accounts WHERE user_id = ? AND status <> 'paid' ORDER BY opened_at DESC", [userId]);
  const accounts = [];
  for (const row of rows) accounts.push(await getAccountDetail(row.id, { includeHistory: false }));
  const pending = accounts.reduce((sum, account) => sum + toCents(account.balance), 0);
  return { current: accounts[0] || null, others: accounts.slice(1), pendingBalance: fromCents(pending) };
}

export async function listAccounts({ userId = null, status = "", from, to, dateBy = "opened", search = "", ...paging } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push("a.user_id = ?"); params.push(userId); }
  if (status) {
    if (!["open", "partial", "paid", "unpaid"].includes(status)) throw new HttpError(400, "Situação inválida.");
    if (status === "unpaid") where.push("a.status <> 'paid'"); else { where.push("a.status = ?"); params.push(status); }
  }
  const { start, end } = dateRange(from, to);
  const column = dateBy === "closed" ? "a.closed_at" : "a.opened_at";
  if (start) { where.push(`${column} >= ?`); params.push(start); }
  if (end) { where.push(`${column} < ?`); params.push(end); }
  if (search.trim()) {
    where.push("(u.name ILIKE ? OR u.email ILIKE ?)");
    const like = `%${escapeLike(search.trim())}%`;
    params.push(like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { page, pageSize, offset } = pageParams(paging);
  const rows = await query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email,
       (SELECT COUNT(*) FROM account_items i WHERE i.account_id = a.id AND i.status = 'active') AS item_count,
       (SELECT STRING_AGG(i.quantity::text || 'x ' || i.name, ', ' ORDER BY i.created_at) FROM account_items i WHERE i.account_id = a.id AND i.status = 'active') AS items_summary
     FROM accounts a JOIN users u ON u.id = a.user_id ${clause}
     ORDER BY a.opened_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params
  );
  const counted = await queryOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(a.total_amount), 0) AS total, COALESCE(SUM(a.paid_amount), 0) AS paid, COALESCE(SUM(a.balance), 0) AS balance
     FROM accounts a JOIN users u ON u.id = a.user_id ${clause}`, params
  );
  return {
    rows: rows.map(mapAccount), page, pageSize, count: Number(counted.count),
    totals: { totalAmount: money(counted.total), paidAmount: money(counted.paid), balance: money(counted.balance) }
  };
}

// ---------------------------------------------------------------- itens

/** Cliente adiciona um produto do cardápio à própria conta. O preço vem SEMPRE do cadastro de produtos. */
export async function addProductForUser({ user, productId, quantity, ip }) {
  const qty = parseQuantity(quantity);
  return transaction(async conn => {
    const product = await queryOne("SELECT * FROM products WHERE id = ?", [String(productId || "")], conn);
    if (!product) throw new HttpError(404, "Produto não encontrado.");
    const account = await getOrCreateOpenAccount(conn, user.id);
    await insertItem(conn, { account, product, name: product.name, unitPriceCents: toCents(product.price), quantity: qty, note: null, actor: user, ip });
    return getAccountDetail(account.id, { conn, includeHistory: false });
  });
}

/** Administrador lança um item (do cardápio ou avulso) na conta de qualquer cliente. */
export async function addItemForUser({ actor, userId, productId, name, quantity, unitPriceCents, note, ip }) {
  const qty = parseQuantity(quantity);
  return transaction(async conn => {
    const customer = await queryOne("SELECT id FROM users WHERE id = ?", [userId], conn);
    if (!customer) throw new HttpError(404, "Usuário não encontrado.");
    let product = null;
    if (productId) {
      product = await queryOne("SELECT * FROM products WHERE id = ?", [productId], conn);
      if (!product) throw new HttpError(404, "Produto não encontrado.");
    }
    const itemName = product && !name ? product.name : requireText(name, "o nome do item", { max: 160 });
    const price = unitPriceCents ?? (product ? toCents(product.price) : null);
    if (price === null) throw new HttpError(400, "Informe o preço unitário.");
    const account = await getOrCreateOpenAccount(conn, userId);
    await insertItem(conn, { account, product, name: itemName, unitPriceCents: price, quantity: qty, note: optionalText(note), actor, ip });
    return getAccountDetail(account.id, { conn });
  });
}

async function loadItemAndLockAccount(conn, itemId) {
  const probe = await queryOne("SELECT account_id FROM account_items WHERE id = ?", [itemId], conn);
  if (!probe) throw new HttpError(404, "Item não encontrado.");
  const account = await lockAccount(conn, probe.account_id);
  const itemRow = await queryOne("SELECT * FROM account_items WHERE id = ? FOR UPDATE", [itemId], conn);
  return { account, item: mapItem(itemRow) };
}

function assertCanChangeTotal(account, newTotalCents) {
  if (newTotalCents < toCents(account.paid_amount)) {
    throw new HttpError(409, `Não é possível alterar: o valor já pago (R$ ${money(account.paid_amount).toFixed(2).replace(".", ",")}) ficaria maior que o novo total da conta. Estorne o pagamento antes.`, "paid-exceeds-total");
  }
}

/**
 * Exclusão LÓGICA de item (o registro permanece no histórico).
 * - Cliente: só os próprios itens, e somente enquanto estiverem pendentes (sem nenhum pagamento sobre eles).
 * - Administrador: pode remover itens já pagos (informando o motivo), desde que o total da conta não fique abaixo do que já foi pago.
 */
export async function removeItem({ actor, itemId, reason, ip }) {
  return transaction(async conn => {
    const { account, item } = await loadItemAndLockAccount(conn, itemId);
    const isAdmin = actor.role === "admin";
    if (!isAdmin && account.user_id !== actor.id) throw new HttpError(404, "Item não encontrado.");
    if (item.status !== "active") throw new HttpError(409, "Este item já foi removido.");

    const items = coverItems((await loadItems(account.id, conn)), money(account.paid_amount));
    const covered = items.find(candidate => candidate.id === item.id);
    const locked = covered.paymentStatus !== "pending" || account.status === "paid";
    if (locked && !isAdmin) throw new HttpError(403, "Este item já foi pago (total ou parcialmente). Somente um administrador pode removê-lo.", "item-paid");

    const cleanReason = locked ? requireText(reason, "o motivo da remoção", { min: 3 }) : optionalText(reason);
    assertCanChangeTotal(account, toCents(account.total_amount) - toCents(item.lineTotal));

    const now = new Date();
    await query("UPDATE account_items SET status = 'removed', removed_at = ?, removed_by = ?, removal_reason = ?, updated_at = ? WHERE id = ?",
      [now, actor.id, cleanReason, now, itemId], conn);
    const updated = await recalculateAccount(conn, account.id);
    await audit(conn, {
      actor, ip, action: "item-removed", entity: "account_item", entityId: itemId, accountId: account.id,
      details: { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal, wasPaid: covered.paymentStatus, reason: cleanReason, previousTotal: money(account.total_amount), newTotal: money(updated.total_amount) }
    });
    return getAccountDetail(account.id, { conn, includeHistory: false });
  });
}

/** Correção de item (somente administrador): nome, quantidade, preço unitário e observação. */
export async function updateItem({ actor, itemId, patch, reason, ip }) {
  return transaction(async conn => {
    const { account, item } = await loadItemAndLockAccount(conn, itemId);
    if (item.status !== "active") throw new HttpError(409, "Este item foi removido e não pode ser alterado.");
    if (account.status === "paid") throw new HttpError(409, "A conta já foi quitada e não pode ser alterada. Estorne o pagamento se precisar corrigi-la.");

    const next = {
      name: patch.name !== undefined ? requireText(patch.name, "o nome do item", { max: 160 }) : item.name,
      quantity: patch.quantity !== undefined ? parseQuantity(patch.quantity) : item.quantity,
      unitPriceCents: patch.unitPriceCents !== undefined ? patch.unitPriceCents : toCents(item.unitPrice),
      note: patch.note !== undefined ? optionalText(patch.note) : item.note
    };
    const newLine = next.unitPriceCents * next.quantity;
    assertCanChangeTotal(account, toCents(account.total_amount) - toCents(item.lineTotal) + newLine);

    const now = new Date();
    await query("UPDATE account_items SET name = ?, quantity = ?, unit_price = ?, note = ?, updated_at = ? WHERE id = ?",
      [next.name, next.quantity, fromCents(next.unitPriceCents), next.note, now, itemId], conn);
    const updated = await recalculateAccount(conn, account.id);
    await audit(conn, {
      actor, ip, action: "item-updated", entity: "account_item", entityId: itemId, accountId: account.id,
      details: {
        reason: optionalText(reason),
        before: { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, note: item.note },
        after: { name: next.name, quantity: next.quantity, unitPrice: fromCents(next.unitPriceCents), note: next.note },
        previousTotal: money(account.total_amount), newTotal: money(updated.total_amount)
      }
    });
    return getAccountDetail(account.id, { conn });
  });
}

// ---------------------------------------------------------------- visão do administrador

export async function listUsersOverview({ search = "", ...paging } = {}) {
  const params = [];
  let clause = "";
  if (search.trim()) {
    clause = "WHERE (u.name ILIKE ? OR u.email ILIKE ? OR u.phone ILIKE ?)";
    const like = `%${escapeLike(search.trim())}%`;
    params.push(like, like, like);
  }
  const { page, pageSize, offset } = pageParams(paging, { defaultSize: 25 });
  const rows = await query(
    `SELECT u.*, COALESCE(s.total, 0) AS total, COALESCE(s.paid, 0) AS paid, COALESCE(s.open_balance, 0) AS open_balance,
            COALESCE(s.accounts, 0) AS accounts, COALESCE(s.unpaid_accounts, 0) AS unpaid_accounts, s.last_activity
     FROM users u LEFT JOIN (
       SELECT user_id, SUM(total_amount) AS total, SUM(paid_amount) AS paid, SUM(balance) AS open_balance, COUNT(*) AS accounts,
              COUNT(*) FILTER (WHERE status <> 'paid') AS unpaid_accounts, MAX(updated_at) AS last_activity
       FROM accounts GROUP BY user_id) s ON s.user_id = u.id
     ${clause} ORDER BY u.name ASC LIMIT ${pageSize} OFFSET ${offset}`, params
  );
  const count = (await queryOne(`SELECT COUNT(*) AS count FROM users u ${clause}`, params)).count;
  return {
    page, pageSize, count: Number(count),
    rows: rows.map(row => ({
      id: row.id, name: row.name, email: row.email, phone: row.phone, cpf: row.cpf, role: row.role, createdAt: row.created_at,
      emailVerified: Boolean(row.email_verified), totalBilled: money(row.total), totalPaid: money(row.paid), openBalance: money(row.open_balance),
      accountsCount: Number(row.accounts), unpaidAccounts: Number(row.unpaid_accounts), lastActivity: row.last_activity
    }))
  };
}

export async function getUserProfile(userId) {
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) throw new HttpError(404, "Usuário não encontrado.");
  const summary = await queryOne(
    `SELECT COALESCE(SUM(total_amount),0) AS total, COALESCE(SUM(paid_amount),0) AS paid, COALESCE(SUM(balance),0) AS balance, COUNT(*) AS accounts FROM accounts WHERE user_id = ?`, [userId]
  );
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, cpf: user.cpf, birthDate: user.birth_date, role: user.role,
    createdAt: user.created_at, emailVerified: Boolean(user.email_verified),
    totalBilled: money(summary.total), totalPaid: money(summary.paid), openBalance: money(summary.balance), accountsCount: Number(summary.accounts)
  };
}
