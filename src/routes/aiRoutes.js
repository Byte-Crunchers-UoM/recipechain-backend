import express from "express";
import { requireSession } from "../middleware/sessionMiddleware.js";
import { askAIShoppingAssistant } from "../controllers/aiController.js";

const router = express.Router();

router.post("/shopping-assistant", requireSession, askAIShoppingAssistant);

export default router;