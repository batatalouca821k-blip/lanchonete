import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const env = process.env;
const bool = (value, fallback = false) => (value === undefined || value === "" ? fallback : ["1", "true", "yes", "sim"].includes(String(value).toLowerCase()));

export const PORT = Number(env.PORT || 3000);
export const APP_URL = env.APP_URL || `http://localhost:${PORT}`;
export const FRONTEND_ORIGIN = (env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map(origin => origin.trim()).filter(Boolean);

// PostgreSQL/Supabase (credenciais mantidas somente no backend)
export const DATABASE_URL = env.NODE_ENV === "test"
  ? env.TEST_DATABASE_URL || env.DATABASE_URL || ""
  : env.DATABASE_URL || "";
export const DB_HOST = env.DB_HOST || "127.0.0.1";
export const DB_PORT = Number(env.DB_PORT || 5432);
export const DB_USER = env.DB_USER || "postgres";
export const DB_PASSWORD = env.DB_PASSWORD || "";
export const DB_NAME = env.DB_NAME || "postgres";
export const DB_SSL = bool(env.DB_SSL, true);
export const DB_SSL_CA_FILE = env.DB_SSL_CA_FILE || "";
export const DB_POOL_SIZE = Number(env.DB_POOL_SIZE || 10);

// Sessão e segurança
export const SESSION_HOURS = Number(env.SESSION_HOURS || 12);
export const ADMIN_EMAIL = (env.ADMIN_EMAIL || "").trim().toLowerCase();
export const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "";
export const TRUST_PROXY = bool(env.TRUST_PROXY, false);

// Fuso horário usado nos filtros de data e nos relatórios (Brasil não tem horário de verão desde 2019)
export const APP_TIMEZONE = env.APP_TIMEZONE || "America/Sao_Paulo";
export const APP_UTC_OFFSET = env.APP_UTC_OFFSET || "-03:00";

// Pix estático (QR Code com a chave da lanchonete). A confirmação é feita pelo administrador
// ou pelo provedor online, nunca pelo próprio cliente.
export const PIX_KEY = env.PIX_KEY || "pix@tokenpedidos.com";
export const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || "LANCHONETE BOCA CHEIA";
export const PIX_CITY = env.PIX_CITY || "SAO PAULO";
export const PIX_EXPIRATION_MINUTES = Number(env.PIX_EXPIRATION_MINUTES || 30);

// Provedor de pagamentos online (opcional). Sem token, o Pix cai no modo estático acima.
export const MERCADOPAGO_ACCESS_TOKEN = env.MERCADOPAGO_ACCESS_TOKEN || "";
export const MERCADOPAGO_WEBHOOK_SECRET = env.MERCADOPAGO_WEBHOOK_SECRET || "";
export const MERCADOPAGO_API_URL = env.MERCADOPAGO_API_URL || "https://api.mercadopago.com";

export const RESEND_API_KEY = env.RESEND_API_KEY || "";
export const MAIL_FROM = env.MAIL_FROM || "";

export const UPLOADS_DIR = new URL("../uploads/", import.meta.url);
export const VALID_STATUSES = ["aguardando", "preparando", "pronto", "entregue"];

// Arquivos legados (somente leitura, usados apenas pelo script de migração)
export const DATA_FILE = new URL("../data/orders.json", import.meta.url);
export const USERS_FILE = new URL("../data/users.json", import.meta.url);
export const ACCESS_LOG_FILE = new URL("../data/access-log.json", import.meta.url);
export const ACCOUNT_FILE = new URL("../data/accounts.json", import.meta.url);
export const PRODUCTS_FILE = new URL("../data/products.json", import.meta.url);
export const LEGACY_SQLITE_FILE = new URL("../data/token-pedidos.sqlite", import.meta.url);
