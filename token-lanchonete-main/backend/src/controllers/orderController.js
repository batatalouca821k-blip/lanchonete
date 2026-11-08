import {
  listOrders,
  findByToken,
  createOrder,
  updateStatus,
  removeOrder
} from "../services/orderService.js";

export async function getOrders(req, res) {
  res.json(await listOrders());
}

export async function getOrderByToken(req, res) {
  const order = await findByToken(req.params.token);
  if (!order) return res.status(404).json({ message: "Token não encontrado." });
  res.json(order);
}

export async function postOrder(req, res) {
  try {
    const order = await createOrder(req.body);
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export async function patchStatus(req, res) {
  try {
    const status = req.body?.status;
    const order = await updateStatus(req.params.id, status);
    res.json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export async function deleteOrder(req, res) {
  try {
    await removeOrder(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
}
