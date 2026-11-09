import { Router } from "express";
import {
  accountDetailAdmin, accounts, addItem, audit, confirm, deleteItem, methods, patchItem, patchMethod, payments,
  postMethod, recordPayment, refund, report, userDetail
} from "../controllers/adminController.js";
import { archiveUser, confirmUserEmail, listAccesses, listUsers, permanentlyDeleteUser, registerUser, resetUserPassword, restoreUser } from "../controllers/authController.js";
import { requireAdmin, requireAuth } from "../services/authService.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/report", report);

router.get("/users", listUsers);
router.post("/users", registerUser);
router.get("/users/:id", userDetail);
router.delete("/users/:id", archiveUser);
router.delete("/users/:id/permanent", permanentlyDeleteUser);
router.post("/users/:id/restore", restoreUser);
router.patch("/users/:id/password", resetUserPassword);
router.post("/users/:id/confirm-email", confirmUserEmail);
router.post("/users/:id/items", addItem);

router.get("/accounts", accounts);
router.get("/accounts/:id", accountDetailAdmin);
router.post("/accounts/:id/payments", recordPayment);

router.patch("/items/:itemId", patchItem);
router.delete("/items/:itemId", deleteItem);

router.get("/payments", payments);
router.post("/payments/:id/confirm", confirm);
router.post("/payments/:id/refund", refund);

router.get("/payment-methods", methods);
router.post("/payment-methods", postMethod);
router.patch("/payment-methods/:code", patchMethod);

router.get("/audit", audit);
router.get("/accesses", listAccesses);

export default router;
