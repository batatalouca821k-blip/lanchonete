ALTER TABLE "lanchonete_app"."users"
ADD COLUMN "deleted_at" timestamp (3) with time zone;
--> statement-breakpoint
CREATE INDEX "idx_users_deleted" ON "lanchonete_app"."users" USING btree ("deleted_at");