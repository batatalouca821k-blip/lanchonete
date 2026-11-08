import { Router } from "express";
import { accountDetail, addMyItem, myAccount, myHistory, myPayments, payMyAccount, removeMyItem } from "../controllers/accountController.js";
import { requireAuth } from "../services/authService.js";

const router = Router();

router.use(requireAuth);
router.get("/me", myAccount);
router.get("/me/history", myHistory);
router.get("/me/payments", myPayments);
router.post("/me/items", addMyItem);
router.delete("/me/items/:itemId", removeMyItem);
router.post("/me/payments", payMyAccount);
router.get("/:id", accountDetail);

export default router;
