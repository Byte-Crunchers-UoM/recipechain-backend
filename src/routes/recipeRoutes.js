import express from 'express'
import { getAllRecipes,
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe,
        getFilteredRecipes,
        searchRecipes
 } from '../controllers/recipeController.js';


const router = express.Router();
router.get('/search', searchRecipes);
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

export default router;