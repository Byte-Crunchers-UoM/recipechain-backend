import express from 'express';
import { 
        addRecipe,
        getAllRecipes,
        getRecipeBy
 } from '../controllers/recipeController.js';

const router = express.Router();

router.post('/recipes', addRecipe);

export default router;