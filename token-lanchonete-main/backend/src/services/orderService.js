import { randomUUID } from "node:crypto";
import { createToken } from "../utils/token.js";
import { deleteOrderById, getOrderBy, getOrders, insertOrder, maxToken, updateOrderStatus } from "../repositories/orderRepository.js";
import { VALID_STATUSES } from "../config.js";

export async function listOrders() {
  return getOrders();
}

export async function findByToken(token) {
  return getOrderBy("token", String(token).trim());
}

export async function createOrder(payload) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("O pedido precisa conter pelo menos um item.");
  }

  const items = payload.items.map(item => ({
    name: String(item.name || "Item").trim(),
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: Math.max(0, Number(item.price || 0))
  }));

  const current = await maxToken();
  const now = new Date().toISOString();
  const order = {
    id: randomUUID(),
    token: createToken(current >= 999 ? 1 : current + 1),
    customer: String(payload.customer || "Cliente").trim() || "Cliente",
    items,
    total: Number(items.reduce((sum, item) => sum + item.quantity * item.price, 0).toFixed(2)),
    status: "aguardando",
    createdAt: now,
    updatedAt: now
  };

  await insertOrder(order);
  return order;
}

export async function updateStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Status inválido.");
  }
  if (!(await updateOrderStatus(id, status))) throw new Error("Pedido não encontrado.");
  return getOrderBy("id", id);
}

export async function removeOrder(id) {
  if (!(await deleteOrderById(id))) throw new Error("Pedido não encontrado.");
}
