import { cancelPayment, getPaymentFor, handleProviderWebhook, listMethods, syncWithProvider } from "../services/paymentService.js";
import * as mercadopago from "../providers/mercadopago.js";

export async function methods(req, res) {
  res.json(await listMethods({ enabledOnly: true, selfServiceOnly: req.user.role !== "admin" }));
}

export async function detail(req, res) {
  res.json(await getPaymentFor(req.user, req.params.id));
}

/** Pergunta ao provedor se o pagamento já foi aprovado (a única fonte confiável). */
export async function refresh(req, res) {
  await getPaymentFor(req.user, req.params.id); // garante que o pagamento é do próprio usuário (ou admin)
  res.json(await syncWithProvider({ paymentId: req.params.id, actor: req.user.role === "admin" ? req.user : null, ip: req.ip }));
}

export async function cancel(req, res) {
  res.json(await cancelPayment({ paymentId: req.params.id, actor: req.user, ip: req.ip }));
}

/**
 * Webhook do provedor. O corpo da requisição NÃO é confiável: usamos apenas o id do pagamento
 * e consultamos o status diretamente na API do provedor antes de confirmar qualquer coisa.
 */
export async function providerWebhook(req, res) {
  const dataId = req.query["data.id"] ?? req.body?.data?.id ?? req.query.id;
  if (!dataId) return res.status(200).json({ ignored: true });
  if (!mercadopago.verifyWebhookSignature(req, dataId)) return res.status(401).json({ message: "Assinatura inválida." });
  try {
    await handleProviderWebhook({ providerRef: dataId, ip: req.ip });
  } catch (error) {
    console.error("Erro ao processar webhook:", error.message);
    return res.status(500).json({ message: "Erro ao processar notificação." }); // o provedor tentará novamente
  }
  res.status(200).json({ ok: true });
}
