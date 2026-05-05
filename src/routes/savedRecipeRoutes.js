import express from 'express'
import { addSavedRecipe, deleteSavedRecipes, getSavedRecipes } from '../controllers/savedRecipeController.js';

const router = express.Router();
router.get('/user/:user_id',getSavedRecipes);
router.post('/',addSavedRecipe);

router.delete('/',deleteSavedRecipes);
export default router;
