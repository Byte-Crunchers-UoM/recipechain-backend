import express from "express";
import { requireSession } from "../middleware/sessionMiddleware.js";
import {
  getMyWalletOverview,
  getMyWalletTransactions,
  createStripeTopupCheckoutSession,
  buyRecipe,
  createWithdrawalRequest,
  createRefundRequest,
} from "../controllers/walletController.js";

const router = express.Router();

router.get("/me", requireSession, getMyWalletOverview);
router.get("/transactions", requireSession, getMyWalletTransactions);
router.post("/topup/checkout-session", requireSession, createStripeTopupCheckoutSession);
router.post("/buy", requireSession, buyRecipe);
router.post("/withdrawals", requireSession, createWithdrawalRequest);
router.post("/refunds", requireSession, createRefundRequest);

export default router;