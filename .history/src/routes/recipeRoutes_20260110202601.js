import express from 'express';
import { 
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';

const router = express.Router();

//CREATE
router.post('/recipes', addRecipe);

//READ
router.get('/recipes', getAllRecipes);
router.get('/recipes/:id',getRecipeById);

//UPDATE
router.put('/recipes/:id', updateRecipe);

//DELETE
router.delete('/recipes/:id', deleteRecipe);

export default router;