import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, transaction } from "../database.js";
import * as schema from "../db/schema.js";
import { products } from "../db/schema.js";
import { HttpError, requireText } from "../utils/http.js";
import { parseAmountToCents, fromCents } from "../utils/money.js";
import { audit } from "./auditService.js";

function mapProduct(row) {
  return { id: row.id, name: row.name, description: row.description, price: Number(row.price), image: row.image, createdAt: row.createdAt ?? row.created_at, updatedAt: row.updatedAt ?? row.updated_at };
}

export async function listProducts() {
  return (await db.select().from(products).orderBy(asc(products.createdAt), asc(products.name))).map(mapProduct);
}

function cleanInput(data) {
  return {
    name: requireText(data.name, "o nome do produto", { max: 160 }),
    description: requireText(data.description, "a descrição", { max: 1000 }),
    priceCents: parseAmountToCents(data.price, { field: "preço", allowZero: true }),
    image: requireText(data.image, "a foto do produto", { max: 500 })
  };
}

export async function createProduct(data, actor, ip) {
  const input = cleanInput(data);
  const id = randomUUID();
  const now = new Date();
  await transaction(async conn => {
    const txdb = drizzle({ client: conn, schema });
    await txdb.insert(products).values({
      id, name: input.name, description: input.description, price: String(fromCents(input.priceCents)),
      image: input.image, createdAt: now, updatedAt: now
    });
    await audit(conn, { actor, ip, action: "create", entity: "product", entityId: id, details: { name: input.name, price: fromCents(input.priceCents) } });
  });
  return mapProduct(await db.query.products.findFirst({ where: eq(products.id, id) }));
}

export async function updateProduct(id, data, actor, ip) {
  const input = cleanInput(data);
  await transaction(async conn => {
    const txdb = drizzle({ client: conn, schema });
    const [current] = await txdb.select().from(products).where(eq(products.id, id)).for("update");
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    await txdb.update(products).set({
      name: input.name, description: input.description, price: String(fromCents(input.priceCents)),
      image: input.image, updatedAt: new Date()
    }).where(eq(products.id, id));
    await audit(conn, { actor, ip, action: "update", entity: "product", entityId: id, details: { before: { name: current.name, price: Number(current.price) }, after: { name: input.name, price: fromCents(input.priceCents) } } });
  });
  return mapProduct(await db.query.products.findFirst({ where: eq(products.id, id) }));
}

export async function removeProduct(id, actor, ip) {
  await transaction(async conn => {
    const txdb = drizzle({ client: conn, schema });
    const [current] = await txdb.select().from(products).where(eq(products.id, id)).for("update");
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    // Os itens já lançados em contas guardam nome e preço próprios, então o histórico não é afetado.
    await txdb.delete(products).where(eq(products.id, id));
    await audit(conn, { actor, ip, action: "delete", entity: "product", entityId: id, details: { name: current.name, price: Number(current.price) } });
  });
}
