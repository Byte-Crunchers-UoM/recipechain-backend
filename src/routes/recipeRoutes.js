import express from 'express'
import { getAllRecipes,
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe,
        getFilteredRecipes,
        verifyRecipe
 } from '../controllers/recipeController.js';


const router = express.Router();

router.get("/",getAllRecipes);

router.get("/filter",getFilteredRecipes)


//CREATE
router.post('/', addRecipe);

//READ
router.get('/:id',getRecipeById);

//UPDATE
router.put('/:id', updateRecipe);

//DELETE
router.delete('/:id', deleteRecipe);

router.patch('/:id/verify', verifyRecipe);

export default router;