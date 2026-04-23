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
const upload = multer({ storage: multer.memoryStorage() });

router.get("/me/profile", requireSession, getMyBuyerProfile);
router.patch(
  "/me/profile",
  requireSession,
  upload.single("profilePhoto"),
  updateMyBuyerProfile
);

router.get("/me/cookbook", requireSession, getMyCookbook);
router.get("/me/cookbook/:recipeId", requireSession, getMyCookbookRecipeDetails);
router.get("/me/cookbook/:recipeId/review", requireSession, getMyCookbookRecipeForReview);
router.post(
  "/me/cookbook/:recipeId/review",
  requireSession,
  upload.array("photos", 5),
  upsertMyCookbookRecipeReview
);
router.post("/me/cookbook/:recipeId/favorite", requireSession, toggleMyCookbookFavorite);

router.post("/", createBuyer);
router.get("/", getAllBuyers);
router.get("/:id", getBuyerById);
router.put("/:id", updateBuyer);
router.delete("/:id", deleteBuyer);

export default router;