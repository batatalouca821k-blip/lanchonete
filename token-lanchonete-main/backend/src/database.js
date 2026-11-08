import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_SSL, DB_SSL_CA_FILE, DB_USER, DATABASE_URL, DB_POOL_SIZE } from "./config.js";
import * as schema from "./db/schema.js";
import { appSchema } from "./db/schema.js";
import { defaultPaymentMethods } from "./db/schema.js";

export function databaseConfig(url = DATABASE_URL) {
  if (!url) {
    return {
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    };
  }

  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL deve usar o protocolo postgres:// ou postgresql://.");
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1))
  };
}

const connectionConfig = {
  ...databaseConfig(),
  max: DB_POOL_SIZE,
  options: `-c search_path=${appSchema.schemaName},public`,
  ...(DB_SSL ? {
    ssl: {
      rejectUnauthorized: true,
      ...(DB_SSL_CA_FILE ? {
        ca: readFileSync(path.resolve(fileURLToPath(new URL("../", import.meta.url)), DB_SSL_CA_FILE))
      } : {})
    }
  } : {})
};

pg.types.setTypeParser(20, value => Number(value));
pg.types.setTypeParser(1700, value => Number(value));

export const pool = new pg.Pool(connectionConfig);
export const db = drizzle({ client: pool, schema });

function postgresPlaceholders(statement) {
  let result = "";
  let parameterIndex = 0;
  let quote = null;
  for (let i = 0; i < statement.length; i += 1) {
    const character = statement[i];
    if (quote) {
      result += character;
      if (character === quote) {
        if (statement[i + 1] === quote) result += statement[++i];
        else quote = null;
      } else if (character === "\\" && quote === "'") {
        result += statement[++i] || "";
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      result += character;
    } else if (character === "?") {
      result += `$${++parameterIndex}`;
    } else {
      result += character;
    }
  }
  return result;
}

/** Consulta SQL parametrizada no pool ou na conexão transacional informada. */
export async function query(statement, params = [], conn = pool) {
  const result = await conn.query(postgresPlaceholders(statement), params);
  return result.command === "SELECT" ? result.rows : { affectedRows: result.rowCount, rows: result.rows };
}

export async function queryOne(statement, params = [], conn = pool) {
  const rows = await query(statement, params, conn);
  return rows[0] || null;
}

/** Executa uma transação READ COMMITTED, repetindo apenas erros transitórios de concorrência. */
export async function transaction(callback, { retries = 3 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await callback(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      if (!["40P01", "40001"].includes(error.code) || attempt >= retries) throw error;
    } finally {
      connection.release();
    }
  }
}

export const isDuplicateError = error => error?.code === "23505";

export async function runMigrations(log = () => {}) {
  log("Aplicando migrações do PostgreSQL...");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });

  const now = new Date();
  for (const method of defaultPaymentMethods) {
    await query(
      "INSERT INTO payment_methods (code, name, enabled, self_service, sort_order, created_at) VALUES (?, ?, TRUE, ?, ?, ?) ON CONFLICT (code) DO NOTHING",
      [method.code, method.name, method.selfService, method.sortOrder, now]
    );
  }
}

export async function closePool() {
  await pool.end();
}
