import { addItemForUser, getAccountDetail, getUserProfile, listAccounts, removeItem, updateItem } from "../services/accountService.js";
import { confirmPayment, createMethod, listMethods, listPayments, recordManualPayment, refundPayment, updateMethod } from "../services/paymentService.js";
import { financialReport, listAudit } from "../services/reportService.js";
import { HttpError } from "../utils/http.js";
import { parseAmountToCents } from "../utils/money.js";

const text = value => String(value || "");

export async function report(req, res) {
  res.json(await financialReport({ from: req.query.from, to: req.query.to }));
}

export async function userDetail(req, res) {
  const profile = await getUserProfile(req.params.id);
  const accounts = await listAccounts({ userId: req.params.id, status: text(req.query.status), from: req.query.from, to: req.query.to, dateBy: req.query.dateBy, page: req.query.page, pageSize: req.query.pageSize });
  res.json({ profile, accounts });
}

export async function accounts(req, res) {
  const { userId, status, from, to, dateBy, search, page, pageSize } = req.query;
  res.json(await listAccounts({ userId: userId || null, status: text(status), from, to, dateBy, search: text(search), page, pageSize }));
}

export async function accountDetailAdmin(req, res) {
  res.json(await getAccountDetail(req.params.id));
}

export async function addItem(req, res) {
  const { productId, name, quantity, unitPrice, note } = req.body || {};
  const unitPriceCents = unitPrice === undefined || unitPrice === "" ? null : parseAmountToCents(unitPrice, { field: "preço unitário", allowZero: true });
  res.status(201).json(await addItemForUser({ actor: req.user, userId: req.params.id, productId, name, quantity, unitPriceCents, note, ip: req.ip }));
}

export async function patchItem(req, res) {
  const { name, quantity, unitPrice, note, reason } = req.body || {};
  const patch = { name, quantity, note };
  if (unitPrice !== undefined) patch.unitPriceCents = parseAmountToCents(unitPrice, { field: "preço unitário", allowZero: true });
  res.json(await updateItem({ actor: req.user, itemId: req.params.itemId, patch, reason, ip: req.ip }));
}

export async function deleteItem(req, res) {
  res.json(await removeItem({ actor: req.user, itemId: req.params.itemId, reason: req.body?.reason, ip: req.ip }));
}

export async function recordPayment(req, res) {
  const amountCents = parseAmountToCents(req.body?.amount, { field: "valor do pagamento" });
  const payment = await recordManualPayment({
    actor: req.user, accountId: req.params.id, amountCents, method: req.body?.method, reference: req.body?.reference,
    note: req.body?.note, idempotencyKey: req.body?.idempotencyKey, ip: req.ip
  });
  res.status(payment.replayed ? 200 : 201).json(payment);
}

export async function payments(req, res) {
  const { userId, accountId, status, method, from, to, search, page, pageSize } = req.query;
  res.json(await listPayments({ userId: userId || null, accountId: accountId || null, status: text(status), method: text(method), from, to, search: text(search), page, pageSize }));
}

export async function confirm(req, res) {
  res.json(await confirmPayment({ paymentId: req.params.id, actor: req.user, via: "admin", reference: req.body?.reference, ip: req.ip }));
}

export async function refund(req, res) {
  res.json(await refundPayment({ paymentId: req.params.id, actor: req.user, reason: req.body?.reason, ip: req.ip }));
}

export async function methods(_req, res) {
  res.json(await listMethods());
}

export async function postMethod(req, res) {
  if (!req.body?.name) throw new HttpError(400, "Informe o nome da forma de pagamento.");
  res.status(201).json(await createMethod({ actor: req.user, ip: req.ip, name: req.body.name, selfService: Boolean(req.body.selfService) }));
}

export async function patchMethod(req, res) {
  res.json(await updateMethod({ actor: req.user, ip: req.ip, code: req.params.code, patch: req.body || {} }));
}

export async function audit(req, res) {
  const { entity, action, actorId, accountId, from, to, page, pageSize } = req.query;
  res.json(await listAudit({ entity: text(entity), action: text(action), actorId: text(actorId), accountId: text(accountId), from, to, page, pageSize }));
}
