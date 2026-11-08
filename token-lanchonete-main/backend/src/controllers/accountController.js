import { addProductForUser, getAccountDetailFor, getMyOpenAccounts, listAccounts, removeItem } from "../services/accountService.js";
import { createSelfServicePayment, listPayments } from "../services/paymentService.js";
import { HttpError } from "../utils/http.js";
import { parseAmountToCents } from "../utils/money.js";

export async function myAccount(req, res) {
  res.json(await getMyOpenAccounts(req.user.id));
}

export async function myHistory(req, res) {
  const { status, from, to, dateBy, page, pageSize } = req.query;
  res.json(await listAccounts({ userId: req.user.id, status: String(status || ""), from, to, dateBy, page, pageSize }));
}

export async function myPayments(req, res) {
  const { status, method, from, to, page, pageSize } = req.query;
  res.json(await listPayments({ userId: req.user.id, status: String(status || ""), method: String(method || ""), from, to, page, pageSize }));
}

export async function accountDetail(req, res) {
  res.json(await getAccountDetailFor(req.user, req.params.id));
}

export async function addMyItem(req, res) {
  if (!req.body?.productId) throw new HttpError(400, "Escolha um produto do cardápio.");
  res.status(201).json(await addProductForUser({ user: req.user, productId: req.body.productId, quantity: req.body.quantity, ip: req.ip }));
}

export async function removeMyItem(req, res) {
  res.json(await removeItem({ actor: req.user, itemId: req.params.itemId, reason: req.body?.reason, ip: req.ip }));
}

export async function payMyAccount(req, res) {
  const amountCents = parseAmountToCents(req.body?.amount, { field: "valor do pagamento" });
  let { accountId } = req.body || {};
  if (!accountId) {
    const { current } = await getMyOpenAccounts(req.user.id);
    if (!current) throw new HttpError(400, "Você não tem nenhuma conta em aberto.");
    accountId = current.id;
  }
  const payment = await createSelfServicePayment({
    user: req.user, accountId, amountCents, method: req.body?.method || "pix", idempotencyKey: req.body?.idempotencyKey, ip: req.ip
  });
  res.status(payment.replayed ? 200 : 201).json(payment);
}
