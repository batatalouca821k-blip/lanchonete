import { Router } from "express";
import { cancel, detail, methods, providerWebhook, refresh } from "../controllers/paymentController.js";
import { requireAuth } from "../services/authService.js";

const router = Router();

router.post("/webhook/mercadopago", providerWebhook); // público: a autenticidade é verificada na API do provedor
router.use(requireAuth);
router.get("/methods", methods);
router.get("/:id", detail);
router.post("/:id/refresh", refresh);
router.post("/:id/cancel", cancel);

export default router;
