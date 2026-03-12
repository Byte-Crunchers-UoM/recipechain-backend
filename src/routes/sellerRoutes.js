import express from "express";
import sellerController from "../controllers/sellerController.js";
import upload from "../middleware/uploadMiddleware.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();

router.post(
  "/kyc/submit",
  requireSession,
  upload.single("idDocument"),
  sellerController.submitKyc
);

router.get("/kyc/status", requireSession, sellerController.getKycStatus);

export default router;