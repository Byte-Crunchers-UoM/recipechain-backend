//
import { 
    addsavedRecipesModel, 
    deleteSavedRecipeModel, 
    getSavedRecipeModel
} from "../models/savedRecipesModel.js";

class SavedRecipeService {
    
    /**
     * Retrieves all recipes a user has saved/bookmarked.
     * Powers the "My Saved Recipes" functionality for end-users.
     */
    async getSavedRecipes(userId) {
        // No more email lookup! Go straight to the data:
        const rawData = await getSavedRecipeModel(userId);

        if (!rawData || rawData.length === 0) return [];

        const formattedCartItems = rawData.map(item => ({
            saved_id: item.saved_id,
            recipe_id: item.recipe_id,
            created_at: item.created_at,
            ...(item.recipes || {}) 
        }));

        return formattedCartItems;
    }

    /**
     * Adds a specific recipe to a user's saved/bookmarked list.
     * Enables users to curate their favorite recipes for later.
     */
    async addSavedRecipes(userId, recipe_id) {
        return await addsavedRecipesModel(userId, recipe_id);
    }

    /**
     * Removes a recipe from a user's saved/bookmarks list.
     * Allows users to manage and unsave recipes.
     */
    async deleteSavedRecipe(userId, recipe_id) {
        return await deleteSavedRecipeModel(userId, recipe_id);
    }
}

export default new SavedRecipeService();