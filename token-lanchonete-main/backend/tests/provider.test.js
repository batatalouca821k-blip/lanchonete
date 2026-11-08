// Pix online (Mercado Pago) contra um servidor FALSO local. Valida a nossa lógica de confirmação;
// a API real do provedor não é chamada aqui.
import http from "node:http";
import { createHmac } from "node:crypto";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

const remote = new Map(); // id -> { status, transaction_amount, external_reference }
let nextId = 9000;
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer TOKEN-DE-TESTE") { res.statusCode = 401; return res.end("{}"); }
    if (req.method === "POST" && req.url === "/v1/payments") {
      const data = JSON.parse(body);
      const id = nextId++;
      remote.set(String(id), { status: "pending", transaction_amount: data.transaction_amount, external_reference: data.external_reference });
      return res.end(JSON.stringify({ id, status: "pending", point_of_interaction: { transaction_data: { qr_code: `00020126MOCK${id}` } } }));
    }
    const match = req.url.match(/^\/v1\/payments\/(\d+)$/);
    if (req.method === "GET" && match && remote.has(match[1])) return res.end(JSON.stringify({ id: Number(match[1]), ...remote.get(match[1]) }));
    res.statusCode = 404; res.end("{}");
  });
});
await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
process.env.MERCADOPAGO_ACCESS_TOKEN = "TOKEN-DE-TESTE";
process.env.MERCADOPAGO_API_URL = `http://127.0.0.1:${mock.address().port}`;
process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-do-webhook";

const { createProductDirect, createUserDirect, key, resetDatabase, shutdown, startServer } = await import("./helpers.js");

let server, token, accountId;
before(async () => {
  await resetDatabase();
  server = await startServer();
  const user = await createUserDirect({ email: "cliente-pix@teste.com" });
  token = await server.login(user);
  const product = await createProductDirect({ price: 100 });
  accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
});
after(async () => { await shutdown(server); mock.close(); });

const balance = async () => (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
const signed = (dataId, requestId = "req-1") => {
  const ts = String(Date.now());
  const v1 = createHmac("sha256", "segredo-do-webhook").update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
};

describe("Pix online", () => {
  test("cria a cobrança no provedor e mantém PENDENTE até o provedor aprovar", async () => {
    const created = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 40, method: "pix", idempotencyKey: key() } });
    assert.equal(created.status, 201);
    assert.equal(created.data.provider, "mercadopago");
    assert.match(created.data.pixPayload, /^00020126MOCK/);
    assert.equal(created.data.status, "pending");

    // "consultar pagamento" enquanto o provedor ainda diz pending não confirma nada
    let refreshed = await server.api("POST", `/api/payments/${created.data.id}/refresh`, { token });
    assert.equal(refreshed.data.status, "pending");
    assert.equal((await balance()).paidAmount, 0);

    // webhook falso (sem assinatura válida) é recusado; com assinatura válida mas provedor ainda pending, nada muda
    const forged = await server.api("POST", `/api/payments/webhook/mercadopago?data.id=${created.data.providerRef}`, { body: { data: { id: created.data.providerRef }, status: "approved" }, headers: { "x-signature": "ts=1,v1=00", "x-request-id": "r" } });
    assert.equal(forged.status, 401);
    const poke = await server.api("POST", `/api/payments/webhook/mercadopago?data.id=${created.data.providerRef}`, { body: { status: "approved" }, headers: signed(created.data.providerRef) });
    assert.equal(poke.status, 200);
    assert.equal((await balance()).paidAmount, 0, "o corpo do webhook não é confiável: só vale o que o provedor informa na API");

    // agora o provedor aprova de verdade
    remote.get(created.data.providerRef).status = "approved";
    const hook = await server.api("POST", `/api/payments/webhook/mercadopago?data.id=${created.data.providerRef}`, { body: {}, headers: signed(created.data.providerRef, "req-2") });
    assert.equal(hook.status, 200);
    const account = await balance();
    assert.deepEqual([account.paidAmount, account.balance, account.status], [40, 60, "partial"]);
    assert.equal(account.payments[0].status, "confirmed");

    // webhook repetido não soma de novo
    await server.api("POST", `/api/payments/webhook/mercadopago?data.id=${created.data.providerRef}`, { body: {}, headers: signed(created.data.providerRef, "req-3") });
    await server.api("POST", `/api/payments/${created.data.id}/refresh`, { token });
    assert.equal((await balance()).paidAmount, 40);
  });

  test("recusa aprovação quando o valor do provedor não confere com o pagamento", async () => {
    const created = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 10, method: "pix", idempotencyKey: key() } });
    remote.get(created.data.providerRef).status = "approved";
    remote.get(created.data.providerRef).transaction_amount = 1; // valor diferente
    const result = await server.api("POST", `/api/payments/${created.data.id}/refresh`, { token });
    assert.equal(result.status, 409);
    assert.equal((await balance()).paidAmount, 40);
  });

  test("pagamento rejeitado/expirado no provedor deixa de reservar o valor", async () => {
    const before = await balance();
    const created = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 20, method: "pix", idempotencyKey: key() } });
    assert.equal(created.status, 201);
    remote.get(created.data.providerRef).status = "rejected";
    const refreshed = await server.api("POST", `/api/payments/${created.data.id}/refresh`, { token });
    assert.equal(refreshed.data.status, "failed");
    assert.equal((await balance()).paidAmount, before.paidAmount);
  });

  test("falha do provedor não deixa pagamento pendente pendurado", async () => {
    const original = process.env.MERCADOPAGO_API_URL;
    assert.ok(original);
    // derruba o servidor falso temporariamente
    await new Promise(resolve => mock.close(resolve));
    const failed = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 5, method: "pix", idempotencyKey: key() } });
    assert.equal(failed.status, 502);
    const payments = (await balance()).payments;
    assert.equal(payments.at(-1).status, "failed");
  });
});
