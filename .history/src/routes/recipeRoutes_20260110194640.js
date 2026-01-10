import express from 'express';
import { addRecipe
        get
 } from '../controllers/recipeController.js';

const router = express.Router();

router.post('/recipes', addRecipe);

export default router;