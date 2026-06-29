import express from 'express';
import { handleChat } from '../controllers/aiController.js';

const router = express.Router();

// POST /api/ai/chat
router.post('/chat', handleChat);

export default router;