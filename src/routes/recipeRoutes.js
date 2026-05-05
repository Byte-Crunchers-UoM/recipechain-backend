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
//search
router.get('/search', searchRecipes);

//Get all recipes
router.get("/",getAllRecipes);

//Filter
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