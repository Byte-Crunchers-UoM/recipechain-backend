import express from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { protectAdmin } from '../middleware/authMiddleware.js'; 

import { getFinanceStats } from '../controllers/financeController.js';
import { requireSession } from '../middleware/sessionMiddleware.js';


const router = express.Router();

// Route: GET /api/dashboard/stats
router.get('/stats', protectAdmin, getDashboardStats);

// This creates the http://localhost:4000/api/dashboard/finance endpoint
router.get('/finance', getFinanceStats);

export default router;