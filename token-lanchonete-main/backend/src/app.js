import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { FRONTEND_ORIGIN, TRUST_PROXY, UPLOADS_DIR } from "./config.js";
import { pool } from "./database.js";
import { HttpError } from "./utils/http.js";
import authRoutes from "./routes/authRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import productRoutes from "./routes/productRoutes.js";

export function createApp() {
  const app = express();
  if (TRUST_PROXY) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || FRONTEND_ORIGIN.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    allowedHeaders: ["Content-Type", "Authorization"]
  }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (_req, res) => {
    res.json({
      service: "token-pedidos-api",
      message: "API online. A interface fica na porta do frontend.",
      health: "/api/health"
    });
  });

  // Imagens enviadas: SVG não pode executar script mesmo se aberto direto no navegador.
  app.use("/uploads", (_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  }, express.static(fileURLToPath(UPLOADS_DIR)));

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, service: "token-pedidos-api", database: "postgresql" });
    } catch {
      res.status(503).json({ ok: false, service: "token-pedidos-api", database: "indisponível" });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/accounts", accountRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ message: "Rota não encontrada." }));

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error instanceof multer.MulterError) return res.status(400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "A imagem deve ter até 5 MB." : "Falha no envio da imagem." });
    if (error?.type === "entity.parse.failed") return res.status(400).json({ message: "Requisição inválida." });
    if (error?.status === 400) return res.status(400).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: "Erro interno do servidor." });
  });

  return app;
}
