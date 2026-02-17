import express from 'express';
import {
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe,
        getTrendingRecipes
} from '../controllers/recipeController.js';

const router = express.Router();

//CREATE
//CREATE
router.post('/', addRecipe);

// TRENDING (Must be before /:id)
router.get('/trending', getTrendingRecipes);

//READ
router.get('/:id', getRecipeById);

//UPDATE
router.put('/:id', updateRecipe);

//DELETE
router.delete('/:id', deleteRecipe);

export default router;