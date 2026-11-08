const TZ = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const money = value => brl.format(Number(value) || 0);
export const date = value => (value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—");
export const time = value => (value ? new Date(value).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "");
export const dateTime = value => (value ? `${date(value)} ${time(value)}` : "—");
export const monthYear = value => new Date(value).toLocaleDateString("pt-BR", { timeZone: TZ, month: "long", year: "numeric" });
export const shortDay = key => { const [, month, day] = key.split("-"); return `${day}/${month}`; };

export function formatBrazilianDateInput(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseBrazilianDateInput(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

/** Situação da conta */
export const ACCOUNT_STATUS = {
  open: { label: "Em aberto", tone: "warn" },
  partial: { label: "Parcialmente paga", tone: "info" },
  paid: { label: "Paga", tone: "ok" }
};

/** Situação do item dentro da conta */
export const ITEM_STATUS = {
  pending: { label: "Pendente", tone: "warn" },
  partial: { label: "Parcial", tone: "info" },
  paid: { label: "Pago", tone: "ok" },
  removed: { label: "Removido", tone: "muted" }
};

export const PAYMENT_STATUS = {
  pending: { label: "Aguardando", tone: "warn" },
  confirmed: { label: "Confirmado", tone: "ok" },
  failed: { label: "Falhou", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "muted" },
  refunded: { label: "Estornado", tone: "danger" }
};

export const AUDIT_ACTIONS = {
  login: "Login", create: "Criação", update: "Atualização", delete: "Exclusão", verify: "E-mail confirmado", "verify-manual": "E-mail confirmado manualmente",
  "item-added": "Item adicionado", "item-removed": "Item removido", "item-updated": "Item corrigido",
  "payment-created": "Pagamento iniciado", "payment-recorded": "Pagamento registrado", "payment-confirmed": "Pagamento confirmado",
  "payment-confirmed-provider": "Pagamento confirmado (provedor)", "payment-cancelled": "Pagamento cancelado", "payment-refunded": "Pagamento estornado",
  "payment-exceeds-balance": "Pagamento acima do saldo", "method-created": "Forma de pagamento criada", "method-updated": "Forma de pagamento alterada"
};

export function describeAudit(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case "item-added": return `${d.quantity}× ${d.name} a ${money(d.unitPrice)} (subtotal ${money(d.lineTotal)}) · total ${money(d.previousTotal)} → ${money(d.newTotal)}`;
    case "item-removed": return `${d.quantity}× ${d.name} (${money(d.lineTotal)})${d.reason ? ` · motivo: ${d.reason}` : ""} · total ${money(d.previousTotal)} → ${money(d.newTotal)}`;
    case "item-updated": return `${d.before?.name}: ${d.before?.quantity}× ${money(d.before?.unitPrice)} → ${d.after?.quantity}× ${money(d.after?.unitPrice)}${d.reason ? ` · motivo: ${d.reason}` : ""}`;
    case "payment-created": return `${money(d.amount)} por ${d.method} (aguardando confirmação)`;
    case "payment-recorded": case "payment-confirmed": case "payment-confirmed-provider": return `${money(d.amount)} · saldo restante ${money(d.newBalance)}`;
    case "payment-refunded": return `${money(d.amount)} estornado · motivo: ${d.reason} · saldo ${money(d.newBalance)}`;
    case "payment-cancelled": return `${money(d.amount)}`;
    case "payment-exceeds-balance": return `${money(d.amount)} acima do saldo ${money(d.balance)}`;
    default: return d.name || d.email || "";
  }
}

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

/** Converte "1.234,50" / "12,5" / "12.5" em número (ou NaN). */
export function parseMoneyInput(text) {
  const raw = String(text ?? "").trim().replace(/^R\$\s*/i, "");
  if (!raw) return NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
}
