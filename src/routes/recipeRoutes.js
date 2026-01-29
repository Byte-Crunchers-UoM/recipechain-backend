import express from 'express'
import { getAllRecipes,
        getRecipesByTag,
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';


const router = express.Router();

router.get("/",getAllRecipes);
router.get("/filter",getRecipesByTag);


//CREATE
router.post('/', addRecipe);

//READ
router.get('/:id',getRecipeById);

//UPDATE
router.put('/:id', updateRecipe);

//DELETE
router.delete('/:id', deleteRecipe);

export default router;