import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createProductDirect, createUserDirect, key, query, resetDatabase, shutdown, startServer } from "./helpers.js";

let server, admin, adminToken;

before(async () => {
  await resetDatabase();
  server = await startServer();
  admin = await createUserDirect({ name: "Admin", role: "admin", email: "admin@teste.com" });
  adminToken = await server.login(admin);
});
after(() => shutdown(server));

async function newCustomer(name = "Cliente") {
  const user = await createUserDirect({ name });
  return { user, token: await server.login(user) };
}
const cents = value => Math.round(value * 100);

describe("cadastro e login", () => {
  test("administrador cadastra usuário; só entra depois de confirmar o e-mail", async () => {
    const created = await server.api("POST", "/api/admin/users", { token: adminToken, body: { name: "Maria Silva", cpf: "123.456.789-09", birthDate: "1992-02-02", phone: "(11) 98888-7777", email: "Maria@Teste.com", password: "segredo123" } });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.email, "maria@teste.com");
    assert.equal(created.data.user.emailVerified, false);
    assert.equal(JSON.stringify(created.data).includes("password"), false, "resposta não pode expor senha/hash");

    const listed = await server.api("GET", "/api/admin/users", { token: adminToken });
    assert.equal(listed.status, 200);
    assert.ok(listed.data.rows.some(user => user.id === created.data.user.id));

    const blocked = await server.api("POST", "/api/auth/login", { body: { email: "maria@teste.com", password: "segredo123" } });
    assert.equal(blocked.status, 403);

    const confirmed = await server.api("POST", `/api/admin/users/${created.data.user.id}/confirm-email`, { token: adminToken });
    assert.equal(confirmed.status, 200);
    const ok = await server.api("POST", "/api/auth/login", { body: { email: "maria@teste.com", password: "segredo123" } });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.accessToken);
    assert.equal(ok.data.user.passwordHash, undefined);
  });

  test("e-mail duplicado e senha curta são recusados", async () => {
    const base = { name: "X", cpf: "1", birthDate: "2000-01-01", phone: "1", email: "dup@teste.com", password: "senha-longa-1" };
    assert.equal((await server.api("POST", "/api/admin/users", { token: adminToken, body: base })).status, 201);
    assert.equal((await server.api("POST", "/api/admin/users", { token: adminToken, body: base })).status, 409);
    assert.equal((await server.api("POST", "/api/admin/users", { token: adminToken, body: { ...base, email: "outro@teste.com", password: "123" } })).status, 400);
  });

  test("login inválido, sem token e logout", async () => {
    const user = await createUserDirect({ email: "login@teste.com" });
    assert.equal((await server.api("POST", "/api/auth/login", { body: { email: user.email, password: "errada" } })).status, 401);
    assert.equal((await server.api("GET", "/api/accounts/me")).status, 401);
    const token = await server.login(user);
    assert.equal((await server.api("GET", "/api/auth/me", { token })).status, 200);
    assert.equal((await server.api("POST", "/api/auth/logout", { token })).status, 204);
    assert.equal((await server.api("GET", "/api/auth/me", { token })).status, 401, "sessão encerrada não pode ser reutilizada");
  });

  test("bloqueia tentativas excessivas de login", async () => {
    const user = await createUserDirect({ email: "brute@teste.com" });
    let last;
    for (let i = 0; i < 9; i += 1) last = await server.api("POST", "/api/auth/login", { body: { email: user.email, password: "errada" } });
    assert.equal(last.status, 429);
    const correct = await server.api("POST", "/api/auth/login", { body: { email: user.email, password: user.password } });
    assert.equal(correct.status, 429);
  });
});

describe("permissões", () => {
  test("usuário comum não acessa rotas administrativas", async () => {
    const { token } = await newCustomer();
    for (const [method, path] of [["GET", "/api/admin/users"], ["GET", "/api/admin/report"], ["GET", "/api/admin/accounts"], ["GET", "/api/admin/payments"], ["GET", "/api/admin/audit"], ["POST", "/api/admin/payment-methods"]]) {
      assert.equal((await server.api(method, path, { token, body: method === "POST" ? { name: "x" } : undefined })).status, 403, `${method} ${path}`);
    }
    const product = await server.api("POST", "/api/products", { token, body: { name: "x" } });
    assert.equal(product.status, 403);
  });

  test("cliente não vê nem altera a conta de outro cliente", async () => {
    const a = await newCustomer("A");
    const b = await newCustomer("B");
    const product = await createProductDirect({ price: 20 });
    const added = await server.api("POST", "/api/accounts/me/items", { token: a.token, body: { productId: product.id, quantity: 1 } });
    const accountId = added.data.id;
    const itemId = added.data.items[0].id;

    assert.equal((await server.api("GET", `/api/accounts/${accountId}`, { token: b.token })).status, 404);
    assert.equal((await server.api("DELETE", `/api/accounts/me/items/${itemId}`, { token: b.token })).status, 404);
    assert.equal((await server.api("POST", "/api/accounts/me/payments", { token: b.token, body: { accountId, amount: 5, method: "pix", idempotencyKey: key() } })).status, 404);
    assert.equal((await server.api("GET", `/api/accounts/${accountId}`, { token: a.token })).status, 200);
    assert.equal((await server.api("GET", `/api/accounts/${accountId}`, { token: adminToken })).status, 200);
  });
});

describe("itens da conta", () => {
  test("o preço vem do cadastro de produtos (cliente não consegue mandar preço próprio)", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 12.9 });
    const result = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 2, price: 0.01, unitPrice: 0.01 } });
    assert.equal(result.status, 201);
    assert.equal(result.data.items[0].unitPrice, 12.9);
    assert.equal(result.data.totalAmount, 25.8);
    assert.equal((await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 0 } })).status, 400);
    assert.equal((await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1.5 } })).status, 400);
    assert.equal((await server.api("POST", "/api/accounts/me/items", { token, body: { productId: "inexistente", quantity: 1 } })).status, 404);
  });

  test("cliente exclui item pendente: total é recalculado e o histórico preserva o item", async () => {
    const { token } = await newCustomer();
    const p1 = await createProductDirect({ name: "Lanche", price: 30 });
    const p2 = await createProductDirect({ name: "Suco", price: 8.5 });
    await server.api("POST", "/api/accounts/me/items", { token, body: { productId: p1.id, quantity: 1 } });
    const second = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: p2.id, quantity: 2 } });
    assert.equal(second.data.totalAmount, 47);
    const suco = second.data.items.find(item => item.name === "Suco");

    const removed = await server.api("DELETE", `/api/accounts/me/items/${suco.id}`, { token });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.totalAmount, 30);
    const history = removed.data.items.find(item => item.id === suco.id);
    assert.equal(history.status, "removed");
    assert.ok(history.removedAt);
    assert.equal((await server.api("DELETE", `/api/accounts/me/items/${suco.id}`, { token })).status, 409, "não remove duas vezes");

    const detail = await server.api("GET", `/api/accounts/${removed.data.id}`, { token });
    const actions = detail.data.changes.map(change => change.action);
    assert.ok(actions.includes("item-added") && actions.includes("item-removed"));
    const [row] = await query("SELECT COUNT(*) AS n FROM account_items WHERE id = ?", [suco.id]);
    assert.equal(Number(row.n), 1, "o registro do item continua no banco");
  });

  test("administrador lança, corrige e remove itens com registro de quem alterou", async () => {
    const { user } = await newCustomer("Cliente do Admin");
    const added = await server.api("POST", `/api/admin/users/${user.id}/items`, { token: adminToken, body: { name: "Marmita especial", quantity: 3, unitPrice: "18,50", note: "sem cebola" } });
    assert.equal(added.status, 201);
    assert.equal(added.data.totalAmount, 55.5);
    assert.equal(added.data.items[0].note, "sem cebola");
    assert.equal(added.data.items[0].addedByName, "Admin");
    const itemId = added.data.items[0].id;

    const edited = await server.api("PATCH", `/api/admin/items/${itemId}`, { token: adminToken, body: { quantity: 2, unitPrice: 20, reason: "correção de preço" } });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.totalAmount, 40);
    const changes = edited.data.changes.filter(change => change.action === "item-updated");
    assert.equal(changes.length, 1);
    assert.equal(changes[0].actorName, "Admin");
    assert.equal(changes[0].details.before.unitPrice, 18.5);
    assert.equal(changes[0].details.after.unitPrice, 20);

    assert.equal((await server.api("POST", `/api/admin/users/${user.id}/items`, { token: adminToken, body: { name: "x", quantity: 1, unitPrice: -5 } })).status, 400);
    assert.equal((await server.api("POST", `/api/admin/users/${user.id}/items`, { token: adminToken, body: { name: "x", quantity: 1 } })).status, 400);
    const removed = await server.api("DELETE", `/api/admin/items/${itemId}`, { token: adminToken, body: {} });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.totalAmount, 0);
  });
});

describe("pagamentos parciais e integrais", () => {
  test("exemplo do pedido: R$150 -> paga 50 -> 100 -> paga 30 -> 70 -> paga 70 -> quitada", async () => {
    const { user, token } = await newCustomer("Pagador");
    const product = await createProductDirect({ price: 50 });
    const added = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 3 } });
    const accountId = added.data.id;
    assert.equal(added.data.totalAmount, 150);

    const pay = async amount => server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount, method: "dinheiro", idempotencyKey: key() } });
    let result = await pay(50);
    assert.equal(result.status, 201);
    let account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance], ["partial", 50, 100]);

    result = await pay("30,00");
    assert.equal(result.status, 201);
    account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance], ["partial", 80, 70]);

    result = await pay(70);
    assert.equal(result.status, 201);
    account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance], ["paid", 150, 0]);
    assert.ok(account.closedAt);
    assert.equal(account.items.length, 1, "itens continuam na conta quitada");
    assert.equal(account.payments.filter(payment => payment.status === "confirmed").length, 3, "os 3 pagamentos continuam registrados");

    // conta quitada não aceita novo pagamento e novos itens abrem outra conta
    assert.equal((await pay(1)).status, 409);
    const next = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } });
    assert.notEqual(next.data.id, accountId);
    assert.equal(next.data.totalAmount, 50);

    const me = await server.api("GET", "/api/accounts/me", { token });
    assert.equal(me.data.current.id, next.data.id);
    assert.equal(me.data.pendingBalance, 50);
    const history = await server.api("GET", "/api/accounts/me/history", { token });
    assert.equal(history.data.count, 2);
    assert.equal(history.data.rows.map(row => row.status).sort().join(), "open,paid");
    const onlyPaid = await server.api("GET", "/api/accounts/me/history?status=paid", { token });
    assert.equal(onlyPaid.data.count, 1);
    assert.equal(user.id, history.data.rows[0].userId);
  });

  test("valida valores no backend: zero, negativo, texto, mais de 2 casas e acima do saldo", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 40 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    for (const amount of [0, -5, "abc", "", null, 10.005, "1e3", 40.01, 41, 999999999]) {
      const result = await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount, method: "dinheiro", idempotencyKey: key() } });
      assert.equal(result.status, 400, `valor ${JSON.stringify(amount)} deveria ser recusado (veio ${result.status})`);
    }
    const sem = await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 5, method: "dinheiro" } });
    assert.equal(sem.status, 400, "exige chave de idempotência");
    const metodo = await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 5, method: "inexistente", idempotencyKey: key() } });
    assert.equal(metodo.status, 400);
    const [row] = await query("SELECT COUNT(*) AS n FROM payments WHERE account_id = ?", [accountId]);
    assert.equal(Number(row.n), 0, "nenhum pagamento inválido foi gravado");
  });

  test("a mesma chave de idempotência nunca registra o pagamento duas vezes (inclusive em paralelo)", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 100 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    const idempotencyKey = key();
    const results = await Promise.all(Array.from({ length: 6 }, () => server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 40, method: "pix", idempotencyKey } })));
    assert.ok(results.every(result => [200, 201].includes(result.status)), JSON.stringify(results.map(r => r.status)));
    assert.equal(new Set(results.map(result => result.data.id)).size, 1);
    const account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.equal(account.paidAmount, 40);
    assert.equal(account.payments.length, 1);

    // reaproveitar a chave para outro valor é um erro
    const clash = await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 10, method: "pix", idempotencyKey } });
    assert.equal(clash.status, 409);
  });

  test("pagamentos simultâneos com chaves diferentes nunca ultrapassam o saldo", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 100 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    const results = await Promise.all(Array.from({ length: 8 }, () => server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 30, method: "dinheiro", idempotencyKey: key() } })));
    assert.equal(results.filter(result => result.status === 201).length, 3, "só cabem 3 pagamentos de 30 em 100");
    const account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.equal(account.paidAmount, 90);
    assert.equal(account.balance, 10);
  });

  test("restrições do banco impedem pagar mais que o total mesmo fora da API", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 10 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    await assert.rejects(() => query("UPDATE accounts SET paid_amount = 999 WHERE id = ?", [accountId]));
  });
});

describe("itens pagos e correções", () => {
  test("item pago não pode ser excluído pelo cliente; administrador precisa informar o motivo", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 25 });
    const first = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } });
    const second = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } });
    const accountId = second.data.id;
    await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 30, method: "dinheiro", idempotencyKey: key() } });

    const detail = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual(detail.items.map(item => item.paymentStatus), ["paid", "partial"]);

    const [paidItem, partialItem] = detail.items;
    assert.equal((await server.api("DELETE", `/api/accounts/me/items/${paidItem.id}`, { token })).status, 403);
    assert.equal((await server.api("DELETE", `/api/accounts/me/items/${partialItem.id}`, { token })).status, 403);
    assert.equal((await server.api("DELETE", `/api/admin/items/${paidItem.id}`, { token: adminToken, body: {} })).status, 400, "motivo obrigatório");
    // remover o item pago deixaria total (25) < pago (30): precisa estornar antes
    const blocked = await server.api("DELETE", `/api/admin/items/${paidItem.id}`, { token: adminToken, body: { reason: "lançado errado" } });
    assert.equal(blocked.status, 409);
    assert.equal(first.data.items.length, 1);
  });

  test("administrador remove item pago quando o total continua cobrindo o que foi pago, e o histórico registra", async () => {
    const { token } = await newCustomer();
    const cheap = await createProductDirect({ price: 10 });
    const dear = await createProductDirect({ price: 90 });
    await server.api("POST", "/api/accounts/me/items", { token, body: { productId: cheap.id, quantity: 1 } });
    const added = await server.api("POST", "/api/accounts/me/items", { token, body: { productId: dear.id, quantity: 1 } });
    const accountId = added.data.id;
    await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 10, method: "dinheiro", idempotencyKey: key() } });
    const cheapItem = added.data.items.find(item => item.unitPrice === 10);
    // com 10 pagos, o item de 10 é o pago; remover derrubaria o total para 90 (>= 10): permitido
    const removed = await server.api("DELETE", `/api/admin/items/${cheapItem.id}`, { token: adminToken, body: { reason: "cliente devolveu" } });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.totalAmount, 90);
    assert.equal(removed.data.paidAmount, 10);
    const log = (await server.api("GET", `/api/admin/accounts/${accountId}`, { token: adminToken })).data.changes.find(change => change.action === "item-removed");
    assert.equal(log.actorName, "Admin");
    assert.equal(log.details.reason, "cliente devolveu");
    assert.equal(log.details.wasPaid, "paid");
  });

  test("estorno devolve o saldo e mantém o pagamento no histórico", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 60 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    const paid = await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 60, method: "debito", reference: "NSU 1234", idempotencyKey: key() } });
    assert.equal((await server.api("GET", `/api/accounts/${accountId}`, { token })).data.status, "paid");

    assert.equal((await server.api("POST", `/api/admin/payments/${paid.data.id}/refund`, { token: adminToken, body: {} })).status, 400);
    assert.equal((await server.api("POST", `/api/admin/payments/${paid.data.id}/refund`, { token, body: { reason: "x1234" } })).status, 403);
    const refunded = await server.api("POST", `/api/admin/payments/${paid.data.id}/refund`, { token: adminToken, body: { reason: "cobrança em duplicidade" } });
    assert.equal(refunded.status, 200);
    assert.equal(refunded.data.status, "refunded");
    const account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance, account.closedAt], ["open", 0, 60, null]);
    assert.equal(account.payments.length, 1);
    assert.equal(account.payments[0].reference, "NSU 1234");
    assert.equal((await server.api("POST", `/api/admin/payments/${paid.data.id}/refund`, { token: adminToken, body: { reason: "de novo, por favor" } })).status, 409);
  });
});

describe("Pix pelo cliente (pendente até confirmação)", () => {
  test("cliente escolhe o valor, gera o Pix, mas o saldo só muda quando um administrador confirma", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 100 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;

    const idempotencyKey = key();
    const pix = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: "25,50", method: "pix", idempotencyKey } });
    assert.equal(pix.status, 201);
    assert.equal(pix.data.status, "pending");
    assert.equal(pix.data.amount, 25.5);
    assert.match(pix.data.pixPayload, /^000201.*6304[0-9A-F]{4}$/);
    assert.ok(pix.data.pixPayload.includes("5405" + "25.50"));

    let account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance], ["open", 0, 100], "intenção de pagamento não abate o saldo");

    const replay = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: "25,50", method: "pix", idempotencyKey } });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.id, pix.data.id);

    // cliente não consegue confirmar o próprio pagamento
    assert.equal((await server.api("POST", `/api/admin/payments/${pix.data.id}/confirm`, { token, body: {} })).status, 403);
    // nem pagar por formas que exigem atendimento
    assert.equal((await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 10, method: "dinheiro", idempotencyKey: key() } })).status, 403);
    // valor reservado por Pix pendentes conta contra o saldo disponível
    const tooMuch = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 80, method: "pix", idempotencyKey: key() } });
    assert.equal(tooMuch.status, 409);
    assert.equal((await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 101, method: "pix", idempotencyKey: key() } })).status, 400);

    const confirmed = await server.api("POST", `/api/admin/payments/${pix.data.id}/confirm`, { token: adminToken, body: { reference: "E2E123" } });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.status, "confirmed");
    assert.equal(confirmed.data.reference, "E2E123");
    account = (await server.api("GET", `/api/accounts/${accountId}`, { token })).data;
    assert.deepEqual([account.status, account.paidAmount, account.balance], ["partial", 25.5, 74.5]);

    const again = await server.api("POST", `/api/admin/payments/${pix.data.id}/confirm`, { token: adminToken, body: {} });
    assert.equal(again.status, 200);
    assert.equal((await server.api("GET", `/api/accounts/${accountId}`, { token })).data.paidAmount, 25.5, "confirmar duas vezes não soma duas vezes");
  });

  test("cliente cancela Pix pendente e libera o valor", async () => {
    const { token } = await newCustomer();
    const product = await createProductDirect({ price: 50 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 1 } })).data.id;
    const pix = await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 50, method: "pix", idempotencyKey: key() } });
    assert.equal((await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 10, method: "pix", idempotencyKey: key() } })).status, 409);
    assert.equal((await server.api("POST", `/api/payments/${pix.data.id}/cancel`, { token })).data.status, "cancelled");
    assert.equal((await server.api("POST", "/api/accounts/me/payments", { token, body: { amount: 10, method: "pix", idempotencyKey: key() } })).status, 201);
    const other = await newCustomer();
    assert.equal((await server.api("GET", `/api/payments/${pix.data.id}`, { token: other.token })).status, 404);
    assert.equal(accountId.length, 36);
  });

  test("formas de pagamento configuráveis pelo administrador", async () => {
    const { token } = await newCustomer();
    const created = await server.api("POST", "/api/admin/payment-methods", { token: adminToken, body: { name: "Vale Refeição" } });
    assert.equal(created.status, 201);
    assert.equal(created.data.code, "vale-refeicao");
    assert.equal((await server.api("POST", "/api/admin/payment-methods", { token: adminToken, body: { name: "Vale Refeição" } })).status, 409);
    const userView = (await server.api("GET", "/api/payments/methods", { token })).data.map(method => method.code);
    assert.deepEqual(userView, ["pix"], "cliente só vê o que pode usar sozinho");
    const adminView = (await server.api("GET", "/api/payments/methods", { token: adminToken })).data.map(method => method.code);
    assert.ok(adminView.includes("vale-refeicao") && adminView.includes("dinheiro"));
    await server.api("PATCH", "/api/admin/payment-methods/vale-refeicao", { token: adminToken, body: { enabled: false } });
    const product = await createProductDirect({ price: 10 });
    const { user } = await newCustomer();
    const added = await server.api("POST", `/api/admin/users/${user.id}/items`, { token: adminToken, body: { productId: product.id, quantity: 1 } });
    const blocked = await server.api("POST", `/api/admin/accounts/${added.data.id}/payments`, { token: adminToken, body: { amount: 5, method: "vale-refeicao", idempotencyKey: key() } });
    assert.equal(blocked.status, 400, "forma desativada não pode ser usada");
  });
});

describe("painel administrativo", () => {
  test("lista usuários com totais, filtra contas e gera relatório", async () => {
    const { user, token } = await newCustomer("Fulano Relatório");
    const product = await createProductDirect({ name: "Item de relatório", price: 70 });
    const accountId = (await server.api("POST", "/api/accounts/me/items", { token, body: { productId: product.id, quantity: 2 } })).data.id;
    await server.api("POST", `/api/admin/accounts/${accountId}/payments`, { token: adminToken, body: { amount: 40, method: "dinheiro", idempotencyKey: key() } });

    const users = await server.api("GET", "/api/admin/users?search=Relat%C3%B3rio", { token: adminToken });
    assert.equal(users.data.count, 1);
    assert.deepEqual([users.data.rows[0].totalBilled, users.data.rows[0].totalPaid, users.data.rows[0].openBalance], [140, 40, 100]);

    const profile = await server.api("GET", `/api/admin/users/${user.id}`, { token: adminToken });
    assert.equal(profile.data.profile.openBalance, 100);
    assert.equal(profile.data.accounts.rows[0].itemsSummary, "2x Item de relatório");

    const partial = await server.api("GET", `/api/admin/accounts?status=partial&userId=${user.id}`, { token: adminToken });
    assert.equal(partial.data.count, 1);
    assert.equal(partial.data.totals.balance, 100);
    assert.equal((await server.api("GET", `/api/admin/accounts?status=paid&userId=${user.id}`, { token: adminToken })).data.count, 0);
    assert.equal((await server.api("GET", "/api/admin/accounts?status=invalido", { token: adminToken })).status, 400);
    assert.equal((await server.api("GET", "/api/admin/accounts?from=2999-01-01", { token: adminToken })).data.count, 0);
    assert.equal((await server.api("GET", "/api/admin/accounts?from=ontem", { token: adminToken })).status, 400);

    const payments = await server.api("GET", `/api/admin/payments?userId=${user.id}&status=confirmed`, { token: adminToken });
    assert.equal(payments.data.count, 1);
    assert.equal(payments.data.confirmedTotal, 40);

    const report = (await server.api("GET", "/api/admin/report", { token: adminToken })).data;
    assert.ok(report.snapshot.billed >= 140 && report.snapshot.received >= 40);
    assert.equal(Math.round((report.snapshot.billed - report.snapshot.received - report.snapshot.outstanding) * 100), 0, "faturado = recebido + em aberto");
    assert.ok(report.movement.byMethod.some(entry => entry.method === "dinheiro"));
    assert.ok(report.movement.topItems.some(entry => entry.name === "Item de relatório"));
    assert.ok(report.topDebtors.some(entry => entry.id === user.id));

    const audit = await server.api("GET", `/api/admin/audit?accountId=${accountId}`, { token: adminToken });
    assert.ok(audit.data.rows.some(row => row.action === "payment-recorded" && row.actorName === "Admin"));
  });
});
