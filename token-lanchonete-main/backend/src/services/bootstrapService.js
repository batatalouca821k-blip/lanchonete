import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ADMIN_EMAIL, ADMIN_PASSWORD, LEGACY_SQLITE_FILE, USERS_FILE } from "../config.js";
import { query, queryOne } from "../database.js";
import { hashPassword } from "./passwordService.js";

const seedProducts = [
  { name: "Combo Burger", description: "Hambúrguer, batata e bebida", price: 29.9, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=85" },
  { name: "Batata Média", description: "Batatas crocantes e douradas", price: 9.9, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=85" },
  { name: "Refrigerante", description: "Bebida gelada 350 ml", price: 7.9, image: "https://images.unsplash.com/photo-1629203849820-fdd70d49c38e?auto=format&fit=crop&w=600&q=85" },
  { name: "Milk-shake", description: "Chocolate cremoso", price: 12.9, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=85" }
];

export const LEGACY_IMPORT_MARKER = "legacy-import-v1";

/** Existem dados antigos (SQLite/JSON) que ainda não foram importados para o PostgreSQL? */
export async function legacyDataPending() {
  const hasLegacyFiles = [LEGACY_SQLITE_FILE, USERS_FILE].some(file => existsSync(fileURLToPath(file)));
  if (!hasLegacyFiles) return false;
  return !(await queryOne("SELECT name FROM schema_migrations WHERE name = ?", [LEGACY_IMPORT_MARKER]));
}

/**
 * Instalação nova (banco vazio): cria o administrador inicial e o cardápio padrão.
 * Se já existirem usuários/produtos (por exemplo, depois da migração), não mexe em nada.
 */
export async function bootstrapData({ log = () => {} } = {}) {
  const now = new Date();

  if (await legacyDataPending()) {
    log("ATENÇÃO: existem dados antigos (SQLite/JSON) ainda não migrados. Rode `npm run db:migrate-legacy --workspace backend` antes de usar o sistema.");
    return;
  }

  if (!(await queryOne("SELECT id FROM users LIMIT 1"))) {
    const email = ADMIN_EMAIL || "admin@tokenpedidos.com";
    const generated = !ADMIN_PASSWORD;
    const password = ADMIN_PASSWORD || randomBytes(9).toString("base64url");
    const record = await hashPassword(password);
    await query(
      `INSERT INTO users (id, name, cpf, birth_date, phone, email, role, password_hash, salt, email_verified, created_at)
       VALUES (?, 'Administrador', '00000000000', '1990-01-01', '', ?, 'admin', ?, ?, TRUE, ?)`,
      [randomUUID(), email, record.passwordHash, record.salt, now]
    );
    log(`Administrador inicial criado: ${email}${generated ? ` | senha gerada (anote agora, ela não será mostrada de novo): ${password}` : ""}`);
  }

  if (!(await queryOne("SELECT id FROM products LIMIT 1"))) {
    for (const product of seedProducts) {
      await query(
        "INSERT INTO products (id, name, description, price, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [randomUUID(), product.name, product.description, product.price, product.image, now, now]
      );
    }
    log("Cardápio padrão criado.");
  }
}
