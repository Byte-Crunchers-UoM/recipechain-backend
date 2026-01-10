import express from 'express';
import { 
        addRecipe,
        getAllRecipes,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';

 //CREATE
const router = express.Router();

router.post('/recipes', addRecipe);

export default router;