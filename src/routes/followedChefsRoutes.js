import express from 'express';
import { 
    getFollowedChefs, 
    getRecipesFromFollowedChefs 
} from '../controllers/followedChefsController.js';

const router = express.Router();

// GET all chefs followed by a user
router.get('/followed', getFollowedChefs);

// GET all recipes from chefs followed by a user
router.get('/followed-recipes', getRecipesFromFollowedChefs);

export default router;
