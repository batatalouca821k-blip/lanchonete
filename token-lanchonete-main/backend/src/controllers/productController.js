import { createProduct, listProducts, removeProduct, updateProduct } from "../services/productService.js";
import { HttpError } from "../utils/http.js";

function withUpload(req) {
  if (req.file) req.body.image = `/uploads/${req.file.filename}`;
  if (!req.body?.name || !req.body?.description || !req.body?.image || req.body?.price === undefined || req.body?.price === "") {
    throw new HttpError(400, "Preencha nome, foto, preço e descrição.");
  }
}

export async function getProducts(_req, res) {
  res.json(await listProducts());
}

export async function postProduct(req, res) {
  withUpload(req);
  res.status(201).json(await createProduct(req.body, req.user, req.ip));
}

export async function patchProduct(req, res) {
  withUpload(req);
  res.json(await updateProduct(req.params.id, req.body, req.user, req.ip));
}

export async function deleteProduct(req, res) {
  await removeProduct(req.params.id, req.user, req.ip);
  res.status(204).end();
}
