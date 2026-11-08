import { createHmac, timingSafeEqual } from "node:crypto";
import { APP_URL, APP_UTC_OFFSET, MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_API_URL, MERCADOPAGO_WEBHOOK_SECRET } from "../config.js";
import { HttpError } from "../utils/http.js";

export const PROVIDER = "mercadopago";
export const isConfigured = () => Boolean(MERCADOPAGO_ACCESS_TOKEN);

async function call(path, { method = "GET", body, idempotencyKey } = {}) {
  let response;
  try {
    response = await fetch(`${MERCADOPAGO_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new HttpError(502, "Não foi possível falar com o provedor de pagamentos. Tente novamente.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago respondeu com erro", response.status, JSON.stringify(data).slice(0, 500));
    throw new HttpError(502, "O provedor de pagamentos recusou a operação. Tente novamente ou use outra forma de pagamento.");
  }
  return data;
}

function withOffset(date) {
  // Formato exigido pelo provedor: 2026-10-27T16:00:00.000-03:00
  const sign = APP_UTC_OFFSET.startsWith("-") ? -1 : 1;
  const [hours, minutes] = APP_UTC_OFFSET.slice(1).split(":").map(Number);
  const shifted = new Date(date.getTime() + sign * (hours * 60 + minutes) * 60000);
  return `${shifted.toISOString().slice(0, 23)}${APP_UTC_OFFSET}`;
}

/** Cria uma cobrança Pix no provedor. O pagamento só é considerado pago quando o provedor confirmar "approved". */
export async function createPixCharge({ paymentId, amountCents, description, payerEmail, expiresAt }) {
  const data = await call("/v1/payments", {
    method: "POST",
    idempotencyKey: paymentId,
    body: {
      transaction_amount: amountCents / 100,
      description,
      payment_method_id: "pix",
      payer: { email: payerEmail },
      external_reference: paymentId,
      notification_url: `${APP_URL}/api/payments/webhook/${PROVIDER}`,
      date_of_expiration: withOffset(expiresAt)
    }
  });
  const payload = data?.point_of_interaction?.transaction_data?.qr_code;
  if (!data?.id || !payload) throw new HttpError(502, "O provedor não devolveu o código Pix.");
  return { providerRef: String(data.id), payload };
}

/** Consulta o estado REAL do pagamento no provedor (nunca confiamos no corpo do webhook). */
export async function fetchPayment(providerRef) {
  const data = await call(`/v1/payments/${encodeURIComponent(providerRef)}`);
  return {
    status: String(data.status || ""),
    amountCents: Math.round(Number(data.transaction_amount) * 100),
    externalReference: data.external_reference ? String(data.external_reference) : null
  };
}

/** Valida a assinatura do webhook quando MERCADOPAGO_WEBHOOK_SECRET está configurado. */
export function verifyWebhookSignature(req, dataId) {
  if (!MERCADOPAGO_WEBHOOK_SECRET) return true;
  const header = String(req.headers["x-signature"] || "");
  const parts = Object.fromEntries(header.split(",").map(part => part.trim().split("=").map(piece => piece.trim())));
  if (!parts.ts || !parts.v1) return false;
  const normalizedId = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${normalizedId};request-id:${req.headers["x-request-id"] || ""};ts:${parts.ts};`;
  const expected = createHmac("sha256", MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest("hex");
  const received = Buffer.from(parts.v1, "hex");
  const wanted = Buffer.from(expected, "hex");
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

/** Estados do provedor -> ação local. */
export function interpretStatus(status) {
  if (status === "approved") return "confirmed";
  if (["rejected"].includes(status)) return "failed";
  if (["cancelled", "expired"].includes(status)) return "cancelled";
  return "pending"; // pending, in_process, authorized...
}
