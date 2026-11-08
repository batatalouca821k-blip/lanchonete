import { query, queryOne, transaction } from "../database.js";

function mapOrder(row, items) {
  return {
    id: row.id, token: row.token, customer: row.customer, total: Number(row.total), status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    items: items.filter(item => item.order_id === row.id).map(item => ({ name: item.name, quantity: item.quantity, price: Number(item.unit_price) }))
  };
}

export async function getOrders() {
  const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
  const items = rows.length ? await query("SELECT * FROM order_items ORDER BY id") : [];
  return rows.map(row => mapOrder(row, items));
}

export async function getOrderBy(column, value) {
  const row = await queryOne(`SELECT * FROM orders WHERE ${column === "token" ? "token" : "id"} = ? ORDER BY created_at DESC LIMIT 1`, [value]);
  if (!row) return null;
  return mapOrder(row, await query("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [row.id]));
}

export async function insertOrder(order) {
  await transaction(async conn => {
    await query("INSERT INTO orders (id, token, customer, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [order.id, order.token, order.customer, order.total, order.status, new Date(order.createdAt), new Date(order.updatedAt)], conn);
    for (const item of order.items) {
      await query("INSERT INTO order_items (order_id, name, quantity, unit_price) VALUES (?, ?, ?, ?)", [order.id, item.name, item.quantity, item.price], conn);
    }
  });
}

export async function updateOrderStatus(id, status) {
  const result = await query("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [status, new Date(), id]);
  return result.affectedRows > 0;
}

export async function deleteOrderById(id) {
  const result = await query("DELETE FROM orders WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

export async function maxToken() {
  const row = await queryOne("SELECT COALESCE(MAX(CASE WHEN token ~ '^[0-9]+$' THEN token::bigint END), 0) AS max FROM orders");
  return Number(row.max);
}
