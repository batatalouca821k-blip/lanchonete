CREATE SCHEMA IF NOT EXISTS "lanchonete_app";--> statement-breakpoint
CREATE TYPE "lanchonete_app"."account_status" AS ENUM('open', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "lanchonete_app"."account_item_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "lanchonete_app"."payment_status" AS ENUM('pending', 'confirmed', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "lanchonete_app"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"user_id" char(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(190) NOT NULL,
	"role" varchar(10) NOT NULL,
	"accessed_at" timestamp (3) with time zone NOT NULL,
	"ip" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "access_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_items" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"account_id" char(36) NOT NULL,
	"product_id" char(36),
	"name" varchar(160) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
	"note" varchar(255),
	"status" "lanchonete_app"."account_item_status" DEFAULT 'active' NOT NULL,
	"added_by" char(36),
	"added_by_role" varchar(10),
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"removed_at" timestamp (3) with time zone,
	"removed_by" char(36),
	"removal_reason" varchar(255),
	CONSTRAINT "ck_items_values" CHECK ("account_items"."unit_price" >= 0 AND "account_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "account_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"user_id" char(36) NOT NULL,
	"status" "lanchonete_app"."account_status" DEFAULT 'open' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"balance" numeric(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
	"opened_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"closed_at" timestamp (3) with time zone,
	CONSTRAINT "ck_accounts_amounts" CHECK ("accounts"."total_amount" >= 0 AND "accounts"."paid_amount" >= 0 AND "accounts"."paid_amount" <= "accounts"."total_amount")
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"actor_id" char(36),
	"actor_name" varchar(120),
	"actor_role" varchar(10),
	"action" varchar(60) NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" varchar(64),
	"account_id" char(36),
	"details" text,
	"ip" varchar(64),
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"user_id" char(36) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" char(36) NOT NULL,
	"name" varchar(160) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	CONSTRAINT "ck_order_items_quantity" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"token" varchar(10) NOT NULL,
	"customer" varchar(120) NOT NULL,
	"total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(20) DEFAULT 'aguardando' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"code" varchar(30) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"self_service" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"account_id" char(36) NOT NULL,
	"user_id" char(36) NOT NULL,
	"method_code" varchar(30) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "lanchonete_app"."payment_status" DEFAULT 'pending' NOT NULL,
	"reference" varchar(120),
	"provider" varchar(30),
	"provider_ref" varchar(120),
	"idempotency_key" varchar(130) NOT NULL,
	"pix_payload" text,
	"expires_at" timestamp (3) with time zone,
	"note" varchar(255),
	"created_by" char(36),
	"created_by_role" varchar(10),
	"created_at" timestamp (3) with time zone NOT NULL,
	"confirmed_at" timestamp (3) with time zone,
	"confirmed_by" char(36),
	"refunded_at" timestamp (3) with time zone,
	"refunded_by" char(36),
	"refund_reason" varchar(255),
	CONSTRAINT "ck_payments_amount" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"image" varchar(500) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ck_products_price" CHECK ("products"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"name" varchar(120) PRIMARY KEY NOT NULL,
	"applied_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schema_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"user_id" char(36) NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(36) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"cpf" varchar(20) NOT NULL,
	"birth_date" varchar(10) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" varchar(190) NOT NULL,
	"role" "lanchonete_app"."user_role" DEFAULT 'user' NOT NULL,
	"password_hash" varchar(256) NOT NULL,
	"salt" varchar(64) NOT NULL,
	"email_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "lanchonete_app"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "lanchonete_app"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "lanchonete_app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "lanchonete_app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lanchonete_app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lanchonete_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "lanchonete_app"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "lanchonete_app"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lanchonete_app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_code_payment_methods_code_fk" FOREIGN KEY ("method_code") REFERENCES "lanchonete_app"."payment_methods"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "lanchonete_app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_confirmed_by" FOREIGN KEY ("confirmed_by") REFERENCES "lanchonete_app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_refunded_by" FOREIGN KEY ("refunded_by") REFERENCES "lanchonete_app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lanchonete_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_logs_user" ON "access_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_access_logs_at" ON "access_logs" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "idx_items_account" ON "account_items" USING btree ("account_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_items_product" ON "account_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_items_added_by" ON "account_items" USING btree ("added_by");--> statement-breakpoint
CREATE INDEX "idx_items_removed_by" ON "account_items" USING btree ("removed_by");--> statement-breakpoint
CREATE INDEX "idx_items_created" ON "account_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_accounts_user_status" ON "accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_accounts_status" ON "accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_accounts_opened" ON "accounts" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_account" ON "audit_log" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_verifications_token" ON "email_verifications" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_email_verifications_user" ON "email_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_token" ON "orders" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_created" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_methods_name" ON "payment_methods" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payments_idempotency" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payments_provider_ref" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "idx_payments_account" ON "payments" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_payments_user" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payments_method" ON "payments" USING btree ("method_code");--> statement-breakpoint
CREATE INDEX "idx_payments_created_by" ON "payments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_payments_confirmed_by" ON "payments" USING btree ("confirmed_by");--> statement-breakpoint
CREATE INDEX "idx_payments_refunded_by" ON "payments" USING btree ("refunded_by");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payments_created" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_payments_confirmed" ON "payments" USING btree ("confirmed_at");--> statement-breakpoint
CREATE INDEX "idx_products_name" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_name" ON "users" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");