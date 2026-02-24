import express from "express";
import { adminLogin, syncWeb3AuthUser, logout } from "../controllers/authController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { requireWeb3Auth } from "../middleware/web3authMiddleware.js";

const router = express.Router();

// Admin login
router.post("/admin-login", adminLogin);

// Web3Auth sync (sets cookie session)
router.post("/web3auth/sync", requireWeb3Auth, syncWeb3AuthUser);

// Logout (clears cookie)
router.post("/logout", logout);

// Test route (admin)
router.get("/admin-dashboard-stats", protectAdmin, (req, res) => {
  res.json({
    message: "Can you see admin dashboard, Middleware is work!",
    user: req.user.email,
  });
});

export default router;