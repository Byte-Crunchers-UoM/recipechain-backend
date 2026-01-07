import express from 'express'
import { getAllRecipes, getRecipesByTag, } from '../controllers/recipeController.js';
const router = express.Router();

router.get("/recipes",getAllRecipes);
router.get("/recipes/tag/:tag",getRecipesByTag);

export default router;