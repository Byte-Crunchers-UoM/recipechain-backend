import express from "express";
import multer from "multer";
import {
  createBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
  deleteBuyer,
  getMyBuyerProfile,
  updateMyBuyerProfile,
} from "../controllers/buyerController.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/me/profile", requireSession, getMyBuyerProfile);
router.patch(
  "/me/profile",
  requireSession,
  upload.single("profilePhoto"),
  updateMyBuyerProfile
);

router.post("/", createBuyer);
router.get("/", getAllBuyers);
router.get("/:id", getBuyerById);
router.put("/:id", updateBuyer);
router.delete("/:id", deleteBuyer);

export default router;