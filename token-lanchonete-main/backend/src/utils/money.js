import { HttpError } from "./http.js";

export const toCents = value => Math.round(Number(value) * 100);
export const fromCents = cents => Math.round(cents) / 100;

/**
 * Converte um valor informado pelo cliente ("50", "50,25", 50.25) em centavos.
 * Rejeita vazio, NaN, zero, negativos e mais de duas casas decimais.
 */
export function parseAmountToCents(input, { field = "valor", allowZero = false } = {}) {
  let text = typeof input === "number" ? String(input) : String(input ?? "").trim();
  if (!text) throw new HttpError(400, `Informe o ${field}.`);
  text = text.replace(/^R\$\s*/i, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new HttpError(400, `O ${field} deve ser um número positivo com até 2 casas decimais.`);
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents > 99_999_999) throw new HttpError(400, `O ${field} informado é grande demais.`);
  if (cents === 0 && !allowZero) throw new HttpError(400, `O ${field} deve ser maior que zero.`);
  return cents;
}

export function parseQuantity(input) {
  const quantity = Number(input ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new HttpError(400, "A quantidade deve ser um número inteiro entre 1 e 999.");
  return quantity;
}
