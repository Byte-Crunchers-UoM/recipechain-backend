import express from "express";
import sellerController from "../controllers/sellerController.js";
import upload from "../middleware/uploadMiddleware.js";
import { requireSession } from "../middleware/sessionMiddleware.js";
import { 
  createSeller, 
  getAllSellers, 
  getSellerById, 
  updateSeller, 
  deleteSeller,
  verifySeller
} from '../controllers/sellerController.js';

const router = express.Router();

router.post('/', createSeller);
router.get('/', getAllSellers);
router.get('/:id', getSellerById);
router.put('/:id', updateSeller);
router.delete('/:id', deleteSeller);
router.patch('/:id/verify', verifySeller);

/**
 * Submit seller KYC details with front and back ID document uploads.
 * requireSession ensures only logged-in users can submit KYC.
 */
router.post(
  "/kyc/submit",
  requireSession,
  upload.fields([
    // Front side of NIC/passport/driving license.
    { name: "idDocumentFront", maxCount: 1 },

    // Back side of the same identity document.
    { name: "idDocumentBack", maxCount: 1 },
  ]),
  sellerController.submitKyc
);

/**
 * Get the logged-in seller's current KYC status.
 * Used by frontend to show form, pending view, approved view, or rejected view.
 */
router.get("/kyc/status", requireSession, sellerController.getKycStatus);

/**
 * Mark approval success page as seen.
 * After this, approved sellers can be routed directly to the seller dashboard.
 */
router.patch(
  "/kyc/approval-page-seen",
  requireSession,
  sellerController.markKycApprovalPageSeen
);

router.get('/', getAllSellers);

export default router;