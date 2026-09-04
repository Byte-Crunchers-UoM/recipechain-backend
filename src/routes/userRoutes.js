import express from "express";
import {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  setUserRole,
  getMe,
  requestMyAccountDeletion,
  deleteMyAccountPermanently,
  getChefProfile,
  followUser,
} from "../controllers/userController.js";

import { validateUser } from "../middleware/inputValidators.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();

// Public / Standard user routes
router.post("/user", validateUser, createUser);
router.get("/user/:id", getUserById);
router.get("/user/chef/:id", getChefProfile);
router.post("/user/:id/follow", followUser);

// Admin-only routes
router.get("/users", protectAdmin, getAllUsers);
router.put("/user/:id", protectAdmin, validateUser, updateUser);
router.delete("/user/:id", protectAdmin, deleteUser);

// Session-cookie based routes
router.get("/me", requireSession, getMe);
router.post("/users/role", requireSession, setUserRole);
router.post("/users/me/delete-request", requireSession, requestMyAccountDeletion);
router.delete("/users/me", requireSession, deleteMyAccountPermanently);

export default router;