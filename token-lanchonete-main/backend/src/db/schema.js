import { sql } from "drizzle-orm";
import {
  bigserial, boolean, char, check, foreignKey, index, integer, numeric, pgEnum,
  pgSchema, smallint, text, timestamp, uniqueIndex, varchar
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("lanchonete_app");
const appTable = appSchema.table.bind(appSchema);

export const userRole = appSchema.enum("user_role", ["user", "admin"]);
export const accountStatus = appSchema.enum("account_status", ["open", "partial", "paid"]);
export const itemStatus = appSchema.enum("account_item_status", ["active", "removed"]);
export const paymentStatus = appSchema.enum("payment_status", ["pending", "confirmed", "failed", "cancelled", "refunded"]);

const createdAt = name => timestamp(name, { precision: 3, withTimezone: true, mode: "date" }).notNull();
const nullableTimestamp = name => timestamp(name, { precision: 3, withTimezone: true, mode: "date" });
const id = name => char(name, { length: 36 });

export const users = appTable("users", {
  id: id("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  cpf: varchar("cpf", { length: 20 }).notNull(),
  birthDate: varchar("birth_date", { length: 10 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  role: userRole("role").notNull().default("user"),
  passwordHash: varchar("password_hash", { length: 256 }).notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  emailVerified: boolean("email_verified").notNull().default(true),
  createdAt: createdAt("created_at"),
  deletedAt: nullableTimestamp("deleted_at")
}, table => [
  uniqueIndex("uq_users_email").on(table.email),
  index("idx_users_name").on(table.name),
  index("idx_users_role").on(table.role),
  index("idx_users_deleted").on(table.deletedAt)
]).enableRLS();

export const sessions = appTable("sessions", {
  tokenHash: char("token_hash", { length: 64 }).primaryKey(),
  userId: id("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ip: varchar("ip", { length: 64 }),
  createdAt: createdAt("created_at"),
  expiresAt: createdAt("expires_at")
}, table => [
  index("idx_sessions_user").on(table.userId),
  index("idx_sessions_expires").on(table.expiresAt)
]).enableRLS();

export const emailVerifications = appTable("email_verifications", {
  id: id("id").primaryKey(),
  userId: id("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: createdAt("expires_at"),
  usedAt: nullableTimestamp("used_at")
}, table => [
  uniqueIndex("uq_email_verifications_token").on(table.tokenHash),
  index("idx_email_verifications_user").on(table.userId)
]).enableRLS();

export const accessLogs = appTable("access_logs", {
  id: id("id").primaryKey(),
  userId: id("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  accessedAt: createdAt("accessed_at"),
  ip: varchar("ip", { length: 64 })
}, table => [
  index("idx_access_logs_user").on(table.userId),
  index("idx_access_logs_at").on(table.accessedAt)
]).enableRLS();

export const products = appTable("products", {
  id: id("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  image: varchar("image", { length: 500 }).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: createdAt("updated_at")
}, table => [
  index("idx_products_name").on(table.name),
  check("ck_products_price", sql`${table.price} >= 0`)
]).enableRLS();

export const paymentMethods = appTable("payment_methods", {
  code: varchar("code", { length: 30 }).primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  selfService: boolean("self_service").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: createdAt("created_at")
}, table => [
  uniqueIndex("uq_payment_methods_name").on(table.name)
]).enableRLS();

export const accounts = appTable("accounts", {
  id: id("id").primaryKey(),
  userId: id("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: accountStatus("status").notNull().default("open"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  balance: numeric("balance", { precision: 12, scale: 2 }).generatedAlwaysAs(sql`total_amount - paid_amount`),
  openedAt: createdAt("opened_at"),
  updatedAt: createdAt("updated_at"),
  closedAt: nullableTimestamp("closed_at")
}, table => [
  index("idx_accounts_user_status").on(table.userId, table.status),
  index("idx_accounts_status").on(table.status),
  index("idx_accounts_opened").on(table.openedAt),
  check("ck_accounts_amounts", sql`${table.totalAmount} >= 0 AND ${table.paidAmount} >= 0 AND ${table.paidAmount} <= ${table.totalAmount}`)
]).enableRLS();

export const accountItems = appTable("account_items", {
  id: id("id").primaryKey(),
  accountId: id("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  productId: id("product_id").references(() => products.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).generatedAlwaysAs(sql`unit_price * quantity`),
  note: varchar("note", { length: 255 }),
  status: itemStatus("status").notNull().default("active"),
  addedBy: id("added_by").references(() => users.id, { onDelete: "set null" }),
  addedByRole: varchar("added_by_role", { length: 10 }),
  createdAt: createdAt("created_at"),
  updatedAt: createdAt("updated_at"),
  removedAt: nullableTimestamp("removed_at"),
  removedBy: id("removed_by").references(() => users.id, { onDelete: "set null" }),
  removalReason: varchar("removal_reason", { length: 255 })
}, table => [
  index("idx_items_account").on(table.accountId, table.status, table.createdAt),
  index("idx_items_product").on(table.productId),
  index("idx_items_added_by").on(table.addedBy),
  index("idx_items_removed_by").on(table.removedBy),
  index("idx_items_created").on(table.createdAt),
  check("ck_items_values", sql`${table.unitPrice} >= 0 AND ${table.quantity} > 0`)
]).enableRLS();

export const payments = appTable("payments", {
  id: id("id").primaryKey(),
  accountId: id("account_id").references(() => accounts.id, { onDelete: "set null" }),
  userId: id("user_id").references(() => users.id, { onDelete: "set null" }),
  methodCode: varchar("method_code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "restrict", onUpdate: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: paymentStatus("status").notNull().default("pending"),
  reference: varchar("reference", { length: 120 }),
  provider: varchar("provider", { length: 30 }),
  providerRef: varchar("provider_ref", { length: 120 }),
  idempotencyKey: varchar("idempotency_key", { length: 130 }).notNull(),
  pixPayload: text("pix_payload"),
  expiresAt: nullableTimestamp("expires_at"),
  note: varchar("note", { length: 255 }),
  createdBy: id("created_by").references(() => users.id, { onDelete: "set null" }),
  createdByRole: varchar("created_by_role", { length: 10 }),
  createdAt: createdAt("created_at"),
  confirmedAt: nullableTimestamp("confirmed_at"),
  confirmedBy: id("confirmed_by"),
  refundedAt: nullableTimestamp("refunded_at"),
  refundedBy: id("refunded_by"),
  refundReason: varchar("refund_reason", { length: 255 })
}, table => [
  uniqueIndex("uq_payments_idempotency").on(table.idempotencyKey),
  uniqueIndex("uq_payments_provider_ref").on(table.provider, table.providerRef),
  index("idx_payments_account").on(table.accountId, table.status),
  index("idx_payments_user").on(table.userId),
  index("idx_payments_method").on(table.methodCode),
  index("idx_payments_created_by").on(table.createdBy),
  index("idx_payments_confirmed_by").on(table.confirmedBy),
  index("idx_payments_refunded_by").on(table.refundedBy),
  index("idx_payments_status").on(table.status),
  index("idx_payments_created").on(table.createdAt),
  index("idx_payments_confirmed").on(table.confirmedAt),
  check("ck_payments_amount", sql`${table.amount} > 0`),
  foreignKey({ name: "fk_payments_confirmed_by", columns: [table.confirmedBy], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "fk_payments_refunded_by", columns: [table.refundedBy], foreignColumns: [users.id] }).onDelete("set null")
]).enableRLS();

export const auditLog = appTable("audit_log", {
  id: id("id").primaryKey(),
  actorId: id("actor_id"),
  actorName: varchar("actor_name", { length: 120 }),
  actorRole: varchar("actor_role", { length: 10 }),
  action: varchar("action", { length: 60 }).notNull(),
  entity: varchar("entity", { length: 40 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  accountId: id("account_id"),
  details: text("details"),
  ip: varchar("ip", { length: 64 }),
  createdAt: createdAt("created_at")
}, table => [
  index("idx_audit_entity").on(table.entity, table.entityId),
  index("idx_audit_account").on(table.accountId, table.createdAt),
  index("idx_audit_actor").on(table.actorId, table.createdAt),
  index("idx_audit_created").on(table.createdAt)
]).enableRLS();

export const orders = appTable("orders", {
  id: id("id").primaryKey(),
  token: varchar("token", { length: 10 }).notNull(),
  customer: varchar("customer", { length: 120 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  status: varchar("status", { length: 20 }).notNull().default("aguardando"),
  createdAt: createdAt("created_at"),
  updatedAt: createdAt("updated_at")
}, table => [
  index("idx_orders_token").on(table.token),
  index("idx_orders_status").on(table.status),
  index("idx_orders_created").on(table.createdAt)
]).enableRLS();

export const orderItems = appTable("order_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: id("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull()
}, table => [
  index("idx_order_items_order").on(table.orderId),
  check("ck_order_items_quantity", sql`${table.quantity} > 0`)
]).enableRLS();

export const schemaMigrations = appTable("schema_migrations", {
  name: varchar("name", { length: 120 }).primaryKey(),
  appliedAt: createdAt("applied_at")
}).enableRLS();

export const defaultPaymentMethods = [
  { code: "pix", name: "Pix", selfService: true, sortOrder: 10 },
  { code: "dinheiro", name: "Dinheiro", selfService: false, sortOrder: 20 },
  { code: "debito", name: "Cartão de débito", selfService: false, sortOrder: 30 },
  { code: "credito", name: "Cartão de crédito", selfService: false, sortOrder: 40 }
];
