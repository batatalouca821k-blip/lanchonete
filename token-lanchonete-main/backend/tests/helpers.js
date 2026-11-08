// Os testes exigem uma URL de banco isolada para evitar qualquer escrita no banco da aplicação.
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Configure TEST_DATABASE_URL com a connection string de um banco PostgreSQL exclusivo para testes.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ADMIN_PASSWORD ||= "x";

const { pool, query, runMigrations, closePool } = await import("../src/database.js");
const { createApp } = await import("../src/app.js");
const { hashPassword } = await import("../src/services/passwordService.js");
const { resetLoginAttempts } = await import("../src/services/authService.js");

export { query, pool };

export async function resetDatabase() {
  await runMigrations();
  const connection = await pool.connect();
  try {
    await connection.query(`TRUNCATE TABLE
      "order_items", "orders", "audit_log", "payments", "account_items", "accounts",
      "payment_methods", "products", "access_logs", "email_verifications", "sessions",
      "users", "schema_migrations"
      RESTART IDENTITY CASCADE`);
  } finally {
    connection.release();
  }
  await runMigrations();
  resetLoginAttempts();
}

export async function createUserDirect({ name = "Cliente Teste", email, role = "user", password = "Senha@1234", verified = true } = {}) {
  const id = randomUUID();
  const record = await hashPassword(password);
  await query(
    `INSERT INTO users (id, name, cpf, birth_date, phone, email, role, password_hash, salt, email_verified, created_at) VALUES (?, ?, '11111111111', '1990-01-01', '(11) 90000-0000', ?, ?, ?, ?, ?, ?)`,
    [id, name, email || `${id.slice(0, 8)}@teste.com`, role, record.passwordHash, record.salt, verified, new Date()]
  );
  return { id, email: email || `${id.slice(0, 8)}@teste.com`, password, name, role };
}

export async function createProductDirect({ name = "Produto Teste", price = 10 } = {}) {
  const id = randomUUID();
  const now = new Date();
  await query("INSERT INTO products (id, name, description, price, image, created_at, updated_at) VALUES (?, ?, 'desc', ?, '/x.png', ?, ?)", [id, name, price, now, now]);
  return { id, name, price };
}

export async function startServer() {
  const app = createApp();
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, { token, body, headers } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function login(user) {
    const result = await api("POST", "/api/auth/login", { body: { email: user.email, password: user.password } });
    if (result.status !== 200) throw new Error(`login falhou: ${result.status} ${JSON.stringify(result.data)}`);
    return result.data.accessToken;
  }

  return { api, login, base, close: () => new Promise(resolve => server.close(resolve)) };
}

export async function shutdown(server) {
  await server?.close();
  await closePool();
}

export const key = () => randomUUID();
