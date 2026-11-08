import { Router } from "express";
import {
  getOrders,
  getOrderByToken,
  postOrder,
  patchStatus,
  deleteOrder
} from "../controllers/orderController.js";

const router = Router();

router.get("/", getOrders);
router.get("/:token", getOrderByToken);
router.post("/", postOrder);
router.patch("/:id/status", patchStatus);
router.delete("/:id", deleteOrder);

export default router;
