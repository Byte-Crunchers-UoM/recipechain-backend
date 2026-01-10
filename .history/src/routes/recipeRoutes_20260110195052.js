import express from 'express';
import { 
        addRecipe,
        getAllRecipes,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';

const router = express.Router();

//CREATE
router.post('/recipes', addRecipe);

//READ
router.get('/recipes', getAllRecipes);
router.get('/recipes',)

export default router;