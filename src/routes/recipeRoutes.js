import express from 'express';

import { 
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe,
        getFilteredRecipes
 } from '../controllers/recipeController.js';


import { validateRecipe } from '../middleware/inputValidators.js';

const router = express.Router();

// CREATE 
router.post('/', validateRecipe, addRecipe);

// READ
router.get('/:id', getRecipeById);

// UPDATE
router.put('/:id', updateRecipe);

// DELETE
router.delete('/:id', deleteRecipe);

export default router;