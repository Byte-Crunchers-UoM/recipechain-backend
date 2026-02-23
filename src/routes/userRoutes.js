import express from 'express';
import { createUser, getUserById, getAllUsers, updateUser, deleteUser } from '../controllers/userController.js';
import validateUser from '../middleware/inputValidators.js';
import { protectAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public/Standard User Routes
router.post("/user", validateUser, createUser);
router.get("/user/:id", getUserById); // Note: Update your controller/service to use user_id here

// Protected Admin Routes
// Using 'protectAdmin' ensures only users in your 'admins' table can access this
router.get("/users", protectAdmin, getAllUsers);

// User Management (Protected)
router.put("/user/:id", protectAdmin, validateUser, updateUser);
router.delete("/user/:id", protectAdmin, deleteUser);

export default router;