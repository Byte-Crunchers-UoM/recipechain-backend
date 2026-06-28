//src/routes/recipeRoute.js

import express from 'express';
import { 
    getAllRecipes,
    addRecipe,
    getRecipeById,
    updateRecipe,
    deleteRecipe,
    getFilteredRecipes,
    searchRecipes,
    unlockRecipe,
    verifyRecipe,
    getCheckoutQuote,
    unlockRecipesBatch
} from '../controllers/recipeController.js';

import { requireSession, optionalSession } from '../middleware/sessionmiddleware.js';

const router = express.Router();

// --- 1. STATIC ROUTES (These should be first) ---

// Search (Use optionalSession so the Purchased badge is visible in the search as well)
router.get('/search', optionalSession, searchRecipes);

// Filter (Use optionalSession)
router.get("/filter", optionalSession, getFilteredRecipes);

router.post('/checkout-quote', optionalSession, getCheckoutQuote);
router.post('/unlock-batch', requireSession, unlockRecipesBatch); 

// Unlock Recipe (A Session is strictly required for payments)
router.post('/unlock', requireSession, unlockRecipe);


// --- 2. DYNAMIC ROUTES (Routes using an ID should come after) ---

// READ BY ID
// Since optionalSession is here, it will unlock the recipe for logged-in users
router.get('/:id', optionalSession, getRecipeById);

// GET ALL RECIPES
// Put this at the very bottom, so it works if the others don't match
router.get("/", optionalSession, getAllRecipes);


// --- 3. WRITE / PROTECTED ROUTES ---

// CREATE
router.post('/', requireSession, addRecipe);

// UPDATE
router.put('/:id', requireSession, updateRecipe);

// DELETE
router.delete('/:id', requireSession, deleteRecipe);

router.patch('/:id/verify', verifyRecipe);

export default router;