import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.DATABASE_URL ||= "postgresql://127.0.0.1/test";
const { closePool, databaseConfig, db, isDuplicateError, query } = await import("../src/database.js");

after(() => closePool());

test("lê connection string PostgreSQL e decodifica credenciais com caracteres reservados", () => {
  assert.deepEqual(databaseConfig("postgresql://tester:p%40ss@db.example:5433/lanchonete_test"), {
    host: "db.example",
    port: 5433,
    user: "tester",
    password: "p@ss",
    database: "lanchonete_test"
  });
});

test("rejeita connection string de outro banco", () => {
  assert.throws(() => databaseConfig("mysql://tester:secret@db.example/test"), /postgres:\/\/ ou postgresql:\/\//);
});

test("registra os modelos Drizzle para consultas tipadas", () => {
  assert.ok(db.query.products);
  assert.ok(db.query.accounts);
  assert.ok(db.query.payments);
});

test("reconhece conflito de unicidade PostgreSQL", () => {
  assert.equal(isDuplicateError({ code: "23505" }), true);
  assert.equal(isDuplicateError({ code: "ER_DUP_ENTRY" }), false);
});

test("converte placeholders sem alterar pontos de interrogação entre aspas", async () => {
  const connection = {
    query: async (statement, params) => {
      assert.equal(statement, `SELECT '?' AS literal, "?" AS identifier, $1 AS value`);
      assert.deepEqual(params, [7]);
      return { command: "SELECT", rows: [{ value: 7 }] };
    }
  };
  assert.deepEqual(await query(`SELECT '?' AS literal, "?" AS identifier, ? AS value`, [7], connection), [{ value: 7 }]);
});
