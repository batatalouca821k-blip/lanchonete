import { Router } from "express";
import { confirmEmail, login, logout, me } from "../controllers/authController.js";
import { requireAuth } from "../services/authService.js";

const router = Router();

router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.get("/verify-email", confirmEmail);

export default router;
