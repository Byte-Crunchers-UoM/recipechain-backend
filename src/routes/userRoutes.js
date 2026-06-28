import express from 'express';
import { createUser, getUserById, getAllUsers, updateUser, deleteUser, getChefProfile, getMe, followUser } from '../controllers/userController.js';
import validateUser from '../middleware/inputValidators.js';
import { protectAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/user", validateUser, createUser);
router.get("/user/:id", getUserById);
router.get("/users", getAllUsers);
// (This combines with /api in index.js to make /api/all)
router.get('/all', protectAdmin, getAllUsers);
router.put("/user/:id", validateUser, updateUser);
router.delete("/user/:id", deleteUser);
router.get("/user/chef/:id", getChefProfile);
router.post("/user/:id/follow", followUser);
router.get("/me", getMe);

export default router;