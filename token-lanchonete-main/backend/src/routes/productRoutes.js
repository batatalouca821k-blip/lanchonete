import { Router } from "express";
import { deleteProduct, getProducts, patchProduct, postProduct } from "../controllers/productController.js";
import { requireAdmin, requireAuth } from "../services/authService.js";
import { uploadProductImage } from "../middleware/upload.js";

const router = Router();

router.use(requireAuth);
router.get("/", getProducts);
router.post("/", requireAdmin, uploadProductImage, postProduct);
router.patch("/:id", requireAdmin, uploadProductImage, patchProduct);
router.delete("/:id", requireAdmin, deleteProduct);

export default router;
