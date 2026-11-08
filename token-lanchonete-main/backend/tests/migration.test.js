// Executa o script real de migração (dados reais de backend/data) em um banco de teste vazio.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { query, resetDatabase, shutdown } from "./helpers.js";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../src/scripts/migrate-legacy.js", import.meta.url));
const dataDir = new URL("../data/", import.meta.url);
const fingerprint = file => { const target = fileURLToPath(new URL(file, dataDir)); return `${statSync(target).size}:${createHash("sha1").update(readFileSync(target)).digest("hex")}`; };
const legacyFiles = ["users.json", "accounts.json", "products.json", "orders.json", "access-log.json", "token-pedidos.sqlite", "token-pedidos.sqlite-wal"];

before(() => resetDatabase());
after(() => shutdown(null));

test("migra os dados reais do SQLite/JSON para o PostgreSQL e valida sem perder nada", async () => {
  const before = Object.fromEntries(legacyFiles.map(file => [file, fingerprint(file)]));
  const { stdout } = await run("node", ["--no-warnings", script], { env: { ...process.env } });
  assert.match(stdout, /Migração validada com sucesso/);

  const count = async table => Number((await query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
  assert.equal(await count("users"), 2);
  assert.equal(await count("products"), 5);
  assert.equal(await count("account_items"), 5);
  assert.equal(await count("access_logs"), 24);
  assert.equal(await count("orders"), 2);
  assert.equal(await count("order_items"), 2);

  const [account] = await query("SELECT status, total_amount, paid_amount FROM accounts");
  assert.deepEqual([account.status, account.total_amount, account.paid_amount], ["open", 65.6, 0]);

  // O produto cadastrado só no SQLite (e não nos JSON) também foi preservado
  assert.equal((await query("SELECT id FROM products WHERE name = 'fogassa de carne'")).length, 1);

  // Os arquivos antigos continuam exatamente iguais
  for (const file of legacyFiles) assert.equal(fingerprint(file), before[file], `${file} foi alterado`);

  // Rodar de novo não duplica nada
  const again = await run("node", ["--no-warnings", script, "--force"], { env: { ...process.env } });
  assert.match(again.stdout, /0 inseridos/);
  assert.equal(await count("users"), 2);
  assert.equal(await count("account_items"), 5);
});

test("a senha antiga continua funcionando depois da migração", async () => {
  const { createApp } = await import("../src/app.js");
  const server = await new Promise(resolve => { const s = createApp().listen(0, "127.0.0.1", () => resolve(s)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "cliente@tokenpedidos.com", password: "123456" })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.role, "user");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
