import express from 'express';
import multer from 'multer';
import { 
        addRecipe,
        getRecipeById,
        updateRecipe,
        deleteRecipe
 } from '../controllers/recipeController.js';
import { validateRecipe } from '../middleware/inputValidators.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

//CREATE
router.post('/', upload.single('image'), validateRecipe, addRecipe);

//READ
router.get('/:id',getRecipeById);

//UPDATE
router.put('/:id', upload.single('image'), updateRecipe);

//DELETE
router.delete('/:id', deleteRecipe);

export default router;