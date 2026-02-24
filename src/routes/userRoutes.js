import express from "express";
import {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  setUserRole,
  getMe,
} from "../controllers/userController.js";

import validateUser from "../middleware/inputValidators.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();

router.post("/user", validateUser, createUser);
router.get("/user/:id", getUserById);
router.get("/users", getAllUsers);

// admin-only
router.get("/all", protectAdmin, getAllUsers);

router.put("/user/:id", validateUser, updateUser);
router.delete("/user/:id", deleteUser);

// ✅ session-cookie based
router.get("/me", requireSession, getMe);
router.post("/users/role", requireSession, setUserRole);

export default router;