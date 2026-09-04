import express from "express";
import { requireSession } from "../middleware/sessionMiddleware.js";
import {
  askAIShoppingAssistant,
  handleChat,
} from "../controllers/aiController.js";

const router = express.Router();

/**
 * Your AI Shopping Assistant
 * Protected because it needs buyer cookbook/unlocked recipe context.
 * POST /api/ai/shopping-assistant
 */
router.post("/shopping-assistant", requireSession, askAIShoppingAssistant);

/**
 * Friend's general AI Chatbot
 * Kept without requireSession to avoid breaking friend's existing frontend logic.
 * POST /api/ai/chat
 */
router.post("/chat", handleChat);

export default router;