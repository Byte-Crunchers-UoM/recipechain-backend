import { 
    addsavedRecipesModel, 
    deleteSavedRecipeModel, 
    getSavedRecipeModel
} from "../models/savedRecipesModel.js";

class SavedRecipeService {
    
    // 🛠️ CHANGED: Accepts userId instead of email
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

    // 🛠️ CHANGED: Accepts userId instead of email
    async addSavedRecipes(userId, recipe_id) {
        return await addsavedRecipesModel(userId, recipe_id);
    }

    // 🛠️ CHANGED: Accepts userId instead of email
    async deleteSavedRecipe(userId, recipe_id) {
        return await deleteSavedRecipeModel(userId, recipe_id);
    }
}

export default new SavedRecipeService();