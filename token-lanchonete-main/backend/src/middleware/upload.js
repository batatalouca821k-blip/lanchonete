import multer from "multer";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { UPLOADS_DIR } from "../config.js";

const storage = multer.diskStorage({
  destination: fileURLToPath(UPLOADS_DIR),
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export const uploadProductImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (imageTypes.has(file.mimetype)) return callback(null, true);
    callback(Object.assign(new Error("Envie uma imagem PNG, JPEG, WebP, GIF ou SVG."), { status: 400 }));
  }
}).single("image");
