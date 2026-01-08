import express from 'express';
import { createRecipe, getRecipeById, getAllRecipes, updateRecipe, deleteRecipe } from '../controllers/recipeController.js';
import validateRecipe from '../middleware/recipeValidator.js';

const router = express.Router();

router.post("/recipes", validateRecipe, createRecipe);
router.get("/recipes", getAllRecipes);
router.get("/recipes/:id", getRecipeById);
router.put("/recipes/:id", validateRecipe, updateRecipe);
router.delete("/recipes/:id", deleteRecipe);

export default router;
