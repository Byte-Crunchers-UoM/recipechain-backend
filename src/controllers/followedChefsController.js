import { 
    getFollowedChefsModel, 
    getRecipesFromFollowedChefsModel 
} from '../models/followedChefsModel.js';

export const getFollowedChefs = async (req, res) => {
    try {
        // In a real app, followerId would come from req.user (auth middleware)
        // For now, we'll use a hardcoded user ID or take it from query
        const followerId = req.query.userId || 'demo-user-id';
        
        const chefs = await getFollowedChefsModel(followerId);
        
        res.status(200).json({
            success: true,
            chefs: chefs
        });
    } catch (error) {
        console.error('Error fetching followed chefs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching followed chefs',
            error: error.message
        });
    }
};

export const getRecipesFromFollowedChefs = async (req, res) => {
    try {
        const followerId = req.query.userId || 'demo-user-id';
        
        const recipes = await getRecipesFromFollowedChefsModel(followerId);
        
        res.status(200).json({
            success: true,
            recipes: recipes
        });
    } catch (error) {
        console.error('Error fetching followed recipes:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching followed recipes',
            error: error.message
        });
    }
};
