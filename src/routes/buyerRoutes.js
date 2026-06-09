import express from "express";
import multer from "multer";
import {
  createBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
  deleteBuyer,
  getMyBuyerProfile,
  updateMyBuyerProfile,
  getMyCookbook,
  getMyCookbookRecipeDetails,
  getMyCookbookRecipeForReview,
  upsertMyCookbookRecipeReview,
  toggleMyCookbookFavorite,
} from "../controllers/buyerController.js";
import { requireSession } from "../middleware/sessionMiddleware.js";

const router = express.Router();

/**
 * Store uploaded files in memory so controllers/services can upload them
 * directly to cloud storage without saving them on the backend server.
 */
const upload = multer({ storage: multer.memoryStorage() });

// Logged-in buyer profile APIs
router.get("/me/profile", requireSession, getMyBuyerProfile);

router.patch(
  "/me/profile",
  requireSession,
  upload.single("profilePhoto"),
  updateMyBuyerProfile
);

// Logged-in buyer cookbook APIs
router.get("/me/cookbook", requireSession, getMyCookbook);

router.get(
  "/me/cookbook/:recipeId",
  requireSession,
  getMyCookbookRecipeDetails
);

router.get(
  "/me/cookbook/:recipeId/review",
  requireSession,
  getMyCookbookRecipeForReview
);

router.post(
  "/me/cookbook/:recipeId/review",
  requireSession,
  upload.array("photos", 5),
  upsertMyCookbookRecipeReview
);

router.post(
  "/me/cookbook/:recipeId/favorite",
  requireSession,
  toggleMyCookbookFavorite
);

// General buyer CRUD APIs, mainly useful for admin/testing flows.
router.post("/", createBuyer);
router.get("/", getAllBuyers);
router.get("/:id", getBuyerById);
router.put("/:id", updateBuyer);
router.delete("/:id", deleteBuyer);

export default router;