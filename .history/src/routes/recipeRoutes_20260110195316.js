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
router.get('/recipes/:id',getRecipebyId);

//UPDATE
router.put('/recipes/:id', updateRecipe);

//DELETE
router.delete('/recipes/:id', dele)

export default router;