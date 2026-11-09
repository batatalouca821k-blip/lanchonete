import { randomUUID } from "node:crypto";
import { PIX_EXPIRATION_MINUTES } from "../config.js";
import { isDuplicateError, query, queryOne, transaction } from "../database.js";
import * as mercadopago from "../providers/mercadopago.js";
import { dateRange, escapeLike } from "../utils/dates.js";
import { HttpError, optionalText, pageParams, requireText } from "../utils/http.js";
import { fromCents, toCents } from "../utils/money.js";
import { getAccountDetail, lockAccount, mapPayment, recalculateAccount } from "./accountService.js";
import { audit } from "./auditService.js";
import { createStaticPixPayload } from "./pixService.js";

const brl = cents => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const PAYMENT_SELECT = `SELECT p.*, m.name AS method_name, u.name AS user_name, u.email AS user_email,
  cb.name AS created_by_name, cf.name AS confirmed_by_name, rf.name AS refunded_by_name
  FROM payments p JOIN payment_methods m ON m.code = p.method_code LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN users cb ON cb.id = p.created_by LEFT JOIN users cf ON cf.id = p.confirmed_by LEFT JOIN users rf ON rf.id = p.refunded_by`;

// ---------------------------------------------------------------- formas de pagamento

export async function listMethods({ enabledOnly = false, selfServiceOnly = false } = {}) {
  const where = [];
  if (enabledOnly) where.push("enabled = TRUE");
  if (selfServiceOnly) where.push("self_service = TRUE");
  const rows = await query(`SELECT * FROM payment_methods ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort_order, name`);
  return rows.map(row => ({ code: row.code, name: row.name, enabled: Boolean(row.enabled), selfService: Boolean(row.self_service), sortOrder: row.sort_order, onlineProvider: row.code === "pix" && mercadopago.isConfigured() ? mercadopago.PROVIDER : null }));
}

const slugify = text => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export async function createMethod({ actor, ip, name, selfService = false }) {
  const cleanName = requireText(name, "o nome da forma de pagamento", { min: 2, max: 60 });
  const code = slugify(cleanName);
  if (!code) throw new HttpError(400, "Nome inválido.");
  try {
    await transaction(async conn => {
      await query("INSERT INTO payment_methods (code, name, enabled, self_service, sort_order, created_at) VALUES (?, ?, TRUE, ?, 100, ?)", [code, cleanName, selfService, new Date()], conn);
      await audit(conn, { actor, ip, action: "method-created", entity: "payment_method", entityId: code, details: { name: cleanName } });
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new HttpError(409, "Já existe uma forma de pagamento com esse nome.");
    throw error;
  }
  return (await listMethods()).find(method => method.code === code);
}

export async function updateMethod({ actor, ip, code, patch }) {
  const current = await queryOne("SELECT * FROM payment_methods WHERE code = ?", [code]);
  if (!current) throw new HttpError(404, "Forma de pagamento não encontrada.");
  const name = patch.name !== undefined ? requireText(patch.name, "o nome", { min: 2, max: 60 }) : current.name;
  const enabled = patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled;
  const selfService = patch.selfService !== undefined ? Boolean(patch.selfService) : current.self_service;
  try {
    await transaction(async conn => {
      await query("UPDATE payment_methods SET name = ?, enabled = ?, self_service = ? WHERE code = ?", [name, enabled, selfService, code], conn);
      await audit(conn, { actor, ip, action: "method-updated", entity: "payment_method", entityId: code, details: { before: { name: current.name, enabled: Boolean(current.enabled), selfService: Boolean(current.self_service) }, after: { name, enabled: Boolean(enabled), selfService: Boolean(selfService) } } });
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new HttpError(409, "Já existe uma forma de pagamento com esse nome.");
    throw error;
  }
  return (await listMethods()).find(method => method.code === code);
}

// ---------------------------------------------------------------- utilidades

function scopedKey(actor, key) {
  const clean = String(key || "").trim();
  if (clean.length < 8 || clean.length > 80) throw new HttpError(400, "Chave de idempotência ausente ou inválida. Recarregue a página e tente de novo.");
  return `${actor.id}:${clean}`;
}

/** Se a mesma chave já foi usada, devolve o pagamento existente (reenvio/duplo clique) em vez de criar outro. */
async function findReplay(conn, idempotencyKey, { accountId, amountCents }) {
  const existing = await queryOne(`${PAYMENT_SELECT} WHERE p.idempotency_key = ?`, [idempotencyKey], conn);
  if (!existing) return null;
  if (existing.account_id !== accountId || toCents(existing.amount) !== amountCents) {
    throw new HttpError(409, "Esta chave de pagamento já foi usada para outra operação.");
  }
  return mapPayment(existing);
}

/** Rede de segurança: se a chave única de idempotência disparar, o pagamento NÃO foi gravado duas vezes. */
async function guardDuplicate(run) {
  try {
    return await run();
  } catch (error) {
    if (isDuplicateError(error) && String(error.message).includes("uq_payments_idempotency")) {
      throw new HttpError(409, "Este pagamento já foi registrado. Atualize a página para ver o saldo atual.");
    }
    throw error;
  }
}

async function loadPayment(paymentId, conn) {
  const row = await queryOne(`${PAYMENT_SELECT} WHERE p.id = ?`, [paymentId], conn);
  if (!row) throw new HttpError(404, "Pagamento não encontrado.");
  return row;
}

async function enabledMethod(conn, code) {
  const method = await queryOne("SELECT * FROM payment_methods WHERE code = ?", [String(code || "")], conn);
  if (!method || !method.enabled) throw new HttpError(400, "Forma de pagamento indisponível.");
  return method;
}

// ---------------------------------------------------------------- criação

/**
 * Cliente escolhe quanto quer pagar e gera uma cobrança (ex.: Pix). Ela nasce PENDENTE e não abate o saldo:
 * só passa a valer quando o provedor confirmar ou um administrador confirmar o recebimento.
 */
export async function createSelfServicePayment({ user, accountId, amountCents, method: methodCode, idempotencyKey, ip }) {
  const key = scopedKey(user, idempotencyKey);
  let replayed = false;

  const created = await guardDuplicate(() => transaction(async conn => {
    const method = await enabledMethod(conn, methodCode);
    if (!method.self_service) throw new HttpError(403, "Esta forma de pagamento deve ser registrada pelo atendimento.");
    const account = await lockAccount(conn, accountId);
    if (account.user_id !== user.id) throw new HttpError(404, "Conta não encontrada.");

    const replay = await findReplay(conn, key, { accountId, amountCents });
    if (replay) { replayed = true; return replay; }

    if (account.status === "paid") throw new HttpError(409, "Esta conta já está quitada.");
    const balance = toCents(account.balance);
    if (amountCents > balance) throw new HttpError(400, `O valor não pode ser maior que o saldo pendente (${brl(balance)}).`);
    const reserved = toCents((await queryOne(
      "SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE account_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)", [accountId, new Date()], conn
    )).v);
    if (amountCents > balance - reserved) {
      throw new HttpError(409, `Você já tem ${brl(reserved)} em pagamentos aguardando confirmação. O valor disponível agora é ${brl(balance - reserved)}.`);
    }

    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PIX_EXPIRATION_MINUTES * 60000);
    const online = method.code === "pix" && mercadopago.isConfigured();
    const txid = id.replace(/-/g, "").slice(0, 25);
    const payload = method.code === "pix" && !online ? createStaticPixPayload(amountCents, txid) : null;

    await query(
      `INSERT INTO payments (id, account_id, user_id, method_code, amount, status, reference, provider, idempotency_key, pix_payload, expires_at, created_by, created_by_role, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, user.id, method.code, fromCents(amountCents), method.code === "pix" && !online ? txid : null, online ? mercadopago.PROVIDER : null, key, payload, expiresAt, user.id, user.role, now], conn
    );
    await audit(conn, { actor: user, ip, action: "payment-created", entity: "payment", entityId: id, accountId, details: { amount: fromCents(amountCents), method: method.code, status: "pending", online } });
    return { ...mapPayment(await loadPayment(id, conn)), online };
  }));

  if (replayed) return { ...created, replayed: true };

  if (created.online) {
    try {
      const charge = await mercadopago.createPixCharge({
        paymentId: created.id, amountCents, description: "Pagamento de conta - Lanchonete Boca Cheia", payerEmail: user.email, expiresAt: new Date(created.expiresAt)
      });
      await query("UPDATE payments SET provider_ref = ?, pix_payload = ? WHERE id = ?", [charge.providerRef, charge.payload, created.id]);
    } catch (error) {
      await query("UPDATE payments SET status = 'failed', note = ? WHERE id = ? AND status = 'pending'", ["Falha ao criar a cobrança no provedor", created.id]);
      throw error;
    }
  }
  return mapPayment(await loadPayment(created.id));
}

/** Administrador registra um recebimento já realizado (dinheiro, cartão na maquininha, Pix conferido etc.). */
export async function recordManualPayment({ actor, accountId, amountCents, method: methodCode, reference, note, idempotencyKey, ip }) {
  const key = scopedKey(actor, idempotencyKey);
  return guardDuplicate(() => transaction(async conn => {
    const method = await enabledMethod(conn, methodCode);
    const account = await lockAccount(conn, accountId);

    const replay = await findReplay(conn, key, { accountId, amountCents });
    if (replay) return { ...replay, replayed: true };

    if (account.status === "paid") throw new HttpError(409, "Esta conta já está quitada.");
    const balance = toCents(account.balance);
    if (amountCents > balance) throw new HttpError(400, `O valor não pode ser maior que o saldo pendente (${brl(balance)}).`);

    const id = randomUUID();
    const now = new Date();
    await query(
      `INSERT INTO payments (id, account_id, user_id, method_code, amount, status, reference, idempotency_key, note, created_by, created_by_role, created_at, confirmed_at, confirmed_by)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, account.user_id, method.code, fromCents(amountCents), optionalText(reference, 120), key, optionalText(note), actor.id, actor.role, now, now, actor.id], conn
    );
    const updated = await recalculateAccount(conn, accountId);
    await audit(conn, {
      actor, ip, action: "payment-recorded", entity: "payment", entityId: id, accountId,
      details: { amount: fromCents(amountCents), method: method.code, reference: optionalText(reference, 120), newBalance: Number(updated.balance), accountStatus: updated.status }
    });
    return mapPayment(await loadPayment(id, conn));
  }));
}

// ---------------------------------------------------------------- confirmação / cancelamento / estorno

/**
 * Confirma um pagamento pendente. `actor` é o administrador (confirmação manual) ou null quando
 * a confirmação vem do provedor (já verificada diretamente na API do provedor).
 */
export async function confirmPayment({ paymentId, actor = null, via = "admin", reference, ip }) {
  return transaction(async conn => {
    const probe = await loadPayment(paymentId, conn);
    if (!probe.account_id) throw new HttpError(409, "Este pagamento foi mantido como histórico e não pode mais ser alterado.");
    const account = await lockAccount(conn, probe.account_id);
    const payment = await loadPayment(paymentId, conn);

    if (payment.status === "confirmed") return { ...mapPayment(payment), replayed: true };
    const confirmable = payment.status === "pending" || (via === "provider" && payment.status === "cancelled");
    if (!confirmable) throw new HttpError(409, "Este pagamento não pode mais ser confirmado.");

    const amount = toCents(payment.amount);
    const balance = toCents(account.balance);
    if (amount > balance) {
      if (via === "provider") {
        // O dinheiro entrou, mas o saldo mudou (ex.: item removido). Não abatemos além do total: registramos para conciliação.
        await query("UPDATE payments SET status = 'failed', note = ? WHERE id = ?", [`Aprovado no provedor, mas excede o saldo (${brl(balance)}). Conciliar/estornar manualmente.`, paymentId], conn);
        await audit(conn, { actor, ip, action: "payment-exceeds-balance", entity: "payment", entityId: paymentId, accountId: account.id, details: { amount: payment.amount, balance: account.balance } });
        return mapPayment(await loadPayment(paymentId, conn));
      }
      throw new HttpError(409, `O pagamento (${brl(amount)}) é maior que o saldo atual da conta (${brl(balance)}). Cancele-o ou ajuste a conta.`);
    }

    const now = new Date();
    await query("UPDATE payments SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, reference = COALESCE(?, reference) WHERE id = ?",
      [now, actor?.id ?? null, optionalText(reference, 120), paymentId], conn);
    const updated = await recalculateAccount(conn, account.id);
    await audit(conn, {
      actor, ip, action: via === "provider" ? "payment-confirmed-provider" : "payment-confirmed", entity: "payment", entityId: paymentId, accountId: account.id,
      details: { amount: payment.amount, method: payment.method_code, via, newBalance: Number(updated.balance), accountStatus: updated.status }
    });
    return mapPayment(await loadPayment(paymentId, conn));
  });
}

export async function cancelPayment({ paymentId, actor, ip }) {
  return transaction(async conn => {
    const probe = await loadPayment(paymentId, conn);
    if (!probe.account_id) throw new HttpError(409, "Este pagamento foi mantido como histórico e não pode mais ser alterado.");
    await lockAccount(conn, probe.account_id);
    const payment = await loadPayment(paymentId, conn);
    if (actor.role !== "admin" && payment.user_id !== actor.id) throw new HttpError(404, "Pagamento não encontrado.");
    if (payment.status !== "pending") throw new HttpError(409, "Só é possível cancelar pagamentos pendentes.");
    await query("UPDATE payments SET status = 'cancelled' WHERE id = ?", [paymentId], conn);
    await audit(conn, { actor, ip, action: "payment-cancelled", entity: "payment", entityId: paymentId, accountId: payment.account_id, details: { amount: payment.amount } });
    return mapPayment(await loadPayment(paymentId, conn));
  });
}

/** Estorno (somente administrador): o pagamento deixa de abater a conta, mas o registro continua no histórico. */
export async function refundPayment({ paymentId, actor, reason, ip }) {
  const cleanReason = requireText(reason, "o motivo do estorno", { min: 3 });
  return transaction(async conn => {
    const probe = await loadPayment(paymentId, conn);
    if (!probe.account_id) throw new HttpError(409, "Este pagamento foi mantido como histórico e não pode mais ser alterado.");
    const account = await lockAccount(conn, probe.account_id);
    const payment = await loadPayment(paymentId, conn);
    if (payment.status !== "confirmed") throw new HttpError(409, "Só é possível estornar pagamentos confirmados.");
    const now = new Date();
    await query("UPDATE payments SET status = 'refunded', refunded_at = ?, refunded_by = ?, refund_reason = ? WHERE id = ?", [now, actor.id, cleanReason, paymentId], conn);
    const updated = await recalculateAccount(conn, account.id);
    await audit(conn, {
      actor, ip, action: "payment-refunded", entity: "payment", entityId: paymentId, accountId: account.id,
      details: { amount: payment.amount, method: payment.method_code, reason: cleanReason, newBalance: Number(updated.balance), accountStatus: updated.status }
    });
    return { ...mapPayment(await loadPayment(paymentId, conn)), providerRefundRequired: Boolean(payment.provider) };
  });
}

// ---------------------------------------------------------------- provedor online

/** Consulta o provedor e aplica o resultado. Só aprova se valor e referência baterem com o pagamento local. */
export async function syncWithProvider({ paymentId, actor = null, ip }) {
  const payment = await loadPayment(paymentId);
  if (!payment.provider || !payment.provider_ref) return mapPayment(payment);
  if (!mercadopago.isConfigured()) throw new HttpError(503, "Provedor de pagamentos não configurado.");
  const remote = await mercadopago.fetchPayment(payment.provider_ref);
  const outcome = mercadopago.interpretStatus(remote.status);

  if (outcome === "confirmed") {
    if (remote.externalReference !== payment.id || remote.amountCents !== toCents(payment.amount)) {
      await audit(null, { actor, ip, action: "provider-mismatch", entity: "payment", entityId: payment.id, accountId: payment.account_id, details: { remote } }).catch(() => {});
      throw new HttpError(409, "Os dados do provedor não conferem com este pagamento.");
    }
    return confirmPayment({ paymentId, actor, via: "provider", ip });
  }
  if (outcome !== "pending" && payment.status === "pending") {
    await query("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'", [outcome, paymentId]);
    return mapPayment(await loadPayment(paymentId));
  }
  return mapPayment(payment);
}

export async function handleProviderWebhook({ providerRef, ip }) {
  const row = await queryOne("SELECT id FROM payments WHERE provider = ? AND provider_ref = ?", [mercadopago.PROVIDER, String(providerRef)]);
  if (!row) return null;
  return syncWithProvider({ paymentId: row.id, ip });
}

// ---------------------------------------------------------------- consultas

export async function getPaymentFor(user, paymentId) {
  const row = await loadPayment(paymentId);
  if (user.role !== "admin" && row.user_id !== user.id) throw new HttpError(404, "Pagamento não encontrado.");
  return mapPayment(row);
}

export async function listPayments({ userId = null, accountId = null, status = "", method = "", from, to, search = "", ...paging } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push("p.user_id = ?"); params.push(userId); }
  if (accountId) { where.push("p.account_id = ?"); params.push(accountId); }
  if (status) { where.push("p.status = ?"); params.push(status); }
  if (method) { where.push("p.method_code = ?"); params.push(method); }
  const { start, end } = dateRange(from, to);
  if (start) { where.push("p.created_at >= ?"); params.push(start); }
  if (end) { where.push("p.created_at < ?"); params.push(end); }
  if (search.trim()) {
    where.push("(u.name ILIKE ? OR u.email ILIKE ? OR p.reference ILIKE ?)");
    const like = `%${escapeLike(search.trim())}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { page, pageSize, offset } = pageParams(paging);
  const rows = await query(`${PAYMENT_SELECT} ${clause} ORDER BY p.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  const count = (await queryOne(`SELECT COUNT(*) AS count FROM payments p LEFT JOIN users u ON u.id = p.user_id ${clause}`, params)).count;
  const sum = (await queryOne(`SELECT COALESCE(SUM(CASE WHEN p.status = 'confirmed' THEN p.amount END), 0) AS confirmed FROM payments p LEFT JOIN users u ON u.id = p.user_id ${clause}`, params)).confirmed;
  return { rows: rows.map(mapPayment), page, pageSize, count: Number(count), confirmedTotal: Number(sum) };
}

export { getAccountDetail };
