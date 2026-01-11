import express from 'express';
import { adminLogin } from '../controllers/authController.js';
import { protectAdmin } from '../middleware/authMiddleware.js'; // <-- 1. Middleware එක import කරන්න

const router = express.Router();

// Login Route
router.post('/admin-login', adminLogin);

// 2. Create Test Route ( Access only Admin) ---
router.get('/admin-dashboard-stats', protectAdmin, (req, res) => {
    res.json({ 
        message: "Can you see admin dashboard, Middleware is work!", 
        user: req.user.email 
    });
});
// -------------------------------------------------------------

export default router;