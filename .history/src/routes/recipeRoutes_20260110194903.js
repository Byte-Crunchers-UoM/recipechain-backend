import express from 'express';
import { 
        addRecipe,
        getAllRecipes,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';

const router = express.Router();

//
router.post('/recipes', addRecipe);

export default router;