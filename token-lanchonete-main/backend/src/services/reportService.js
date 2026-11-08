import { query, queryOne } from "../database.js";
import { dateRange, dayKey } from "../utils/dates.js";
import { HttpError, pageParams } from "../utils/http.js";
import { fromCents, toCents } from "../utils/money.js";
import { mapAudit } from "./auditService.js";

const money = value => Number(value || 0);
const DAY = 24 * 3600 * 1000;

/** Totais gerais (situação atual) + movimento do período escolhido (padrão: últimos 30 dias). */
export async function financialReport({ from, to } = {}) {
  let rangeFrom = from;
  let rangeTo = to;
  if (!rangeFrom && !rangeTo) {
    rangeTo = dayKey(new Date());
    rangeFrom = dayKey(new Date(Date.now() - 29 * DAY));
  }
  const { start, end } = dateRange(rangeFrom, rangeTo);
  const lower = start ?? new Date(0);
  const upper = end ?? new Date(Date.now() + DAY);

  const statusRows = await query("SELECT status, COUNT(*) AS count, SUM(total_amount) AS total, SUM(paid_amount) AS paid, SUM(balance) AS balance FROM accounts GROUP BY status");
  const byStatus = { open: blankStatus(), partial: blankStatus(), paid: blankStatus() };
  for (const row of statusRows) byStatus[row.status] = { count: Number(row.count), total: money(row.total), paid: money(row.paid), balance: money(row.balance) };
  const sumCents = key => toCents(Object.values(byStatus).reduce((sum, entry) => sum + toCents(entry[key]), 0) / 100);

  const pending = await queryOne("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > ?)", [new Date()]);
  const customers = await queryOne("SELECT COUNT(*) AS count FROM users WHERE role = 'user'");

  const payments = await query(
    `SELECT p.amount, p.confirmed_at, p.method_code, m.name AS method_name FROM payments p JOIN payment_methods m ON m.code = p.method_code
     WHERE p.status = 'confirmed' AND p.confirmed_at >= ? AND p.confirmed_at < ?`, [lower, upper]
  );
  const items = await query("SELECT line_total, created_at FROM account_items WHERE status = 'active' AND created_at >= ? AND created_at < ?", [lower, upper]);

  const days = new Map();
  const bucket = key => { if (!days.has(key)) days.set(key, { date: key, received: 0, consumed: 0 }); return days.get(key); };
  const methods = new Map();
  let received = 0;
  let consumed = 0;
  for (const payment of payments) {
    const cents = toCents(payment.amount);
    received += cents;
    bucket(dayKey(payment.confirmed_at)).received += cents;
    const entry = methods.get(payment.method_code) || { method: payment.method_code, name: payment.method_name, count: 0, total: 0 };
    entry.count += 1; entry.total += cents; methods.set(payment.method_code, entry);
  }
  for (const item of items) {
    const cents = toCents(item.line_total);
    consumed += cents;
    bucket(dayKey(item.created_at)).consumed += cents;
  }

  const topItems = await query(
    `SELECT name, SUM(quantity) AS quantity, SUM(line_total) AS total FROM account_items
     WHERE status = 'active' AND created_at >= ? AND created_at < ? GROUP BY name ORDER BY total DESC LIMIT 8`, [lower, upper]
  );
  const topDebtors = await query(
    `SELECT u.id, u.name, u.email, SUM(a.balance) AS balance, COUNT(*) AS accounts FROM accounts a JOIN users u ON u.id = a.user_id
     WHERE a.status <> 'paid' GROUP BY u.id, u.name, u.email HAVING SUM(a.balance) > 0 ORDER BY balance DESC LIMIT 5`
  );

  return {
    period: { from: rangeFrom || null, to: rangeTo || null },
    snapshot: {
      customers: Number(customers.count),
      billed: fromCents(sumCents("total")), received: fromCents(sumCents("paid")), outstanding: fromCents(sumCents("balance")),
      byStatus, pendingPayments: { count: Number(pending.count), total: money(pending.total) }
    },
    movement: {
      received: fromCents(received), consumed: fromCents(consumed), paymentsCount: payments.length,
      byMethod: [...methods.values()].map(entry => ({ ...entry, total: fromCents(entry.total) })).sort((a, b) => b.total - a.total),
      byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(entry => ({ ...entry, received: fromCents(entry.received), consumed: fromCents(entry.consumed) })),
      topItems: topItems.map(row => ({ name: row.name, quantity: Number(row.quantity), total: money(row.total) })),
    },
    topDebtors: topDebtors.map(row => ({ id: row.id, name: row.name, email: row.email, balance: money(row.balance), accounts: Number(row.accounts) }))
  };
}

function blankStatus() { return { count: 0, total: 0, paid: 0, balance: 0 }; }

export async function listAudit({ entity = "", action = "", actorId = "", accountId = "", from, to, ...paging } = {}) {
  const where = [];
  const params = [];
  if (entity) { where.push("entity = ?"); params.push(entity); }
  if (action) { where.push("action = ?"); params.push(action); }
  if (actorId) { where.push("actor_id = ?"); params.push(actorId); }
  if (accountId) { where.push("account_id = ?"); params.push(accountId); }
  const { start, end } = dateRange(from, to);
  if (start) { where.push("created_at >= ?"); params.push(start); }
  if (end) { where.push("created_at < ?"); params.push(end); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { page, pageSize, offset } = pageParams(paging, { defaultSize: 30 });
  const rows = await query(`SELECT * FROM audit_log ${clause} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  const count = (await queryOne(`SELECT COUNT(*) AS count FROM audit_log ${clause}`, params)).count;
  if (page > 1 && !rows.length && Number(count) === 0) throw new HttpError(404, "Nada encontrado.");
  return { rows: rows.map(mapAudit), page, pageSize, count: Number(count) };
}
