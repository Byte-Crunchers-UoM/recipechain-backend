import express from "express";
import sellerController from "../controllers/sellerController.js"; // ✅ FIXED
import upload from "../middleware/uploadMiddleware.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();

router.post(
  "/kyc/submit",
  requireSession,
  upload.fields([
    { name: "idDocumentFront", maxCount: 1 },
    { name: "idDocumentBack", maxCount: 1 },
  ]),
  sellerController.submitKyc
);

router.get("/kyc/status", requireSession, sellerController.getKycStatus);

router.patch(
  "/kyc/approval-page-seen",
  requireSession,
  sellerController.markKycApprovalPageSeen
);

export default router;