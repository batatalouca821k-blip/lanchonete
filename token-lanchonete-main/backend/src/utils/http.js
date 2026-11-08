export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireText(value, field, { min = 1, max = 255 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length < min) throw new HttpError(400, min > 1 ? `${field}: informe pelo menos ${min} caracteres.` : `Informe ${field}.`);
  if (text.length > max) throw new HttpError(400, `${field}: no máximo ${max} caracteres.`);
  return text;
}

export function optionalText(value, max = 255) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new HttpError(400, `Texto muito longo (máximo ${max} caracteres).`);
  return text;
}

export function pageParams(query, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Math.trunc(Number(query.pageSize)) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
