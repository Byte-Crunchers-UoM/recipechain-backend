import { 
    addsavedRecipesModel, 
    deleteSavedRecipeModel, 
    getSavedRecipeModel,
    getUserIdByEmailModel 
} from "../models/savedRecipesModel.js";

class savedRecipeService {
    
    async getSavedRecipes(email) {
        try {
            const user_id = await getUserIdByEmailModel(email);
            return await getSavedRecipeModel(user_id);
        } catch (error) {
            if (error.message === "User not found") return [];
            throw error;
        }
    }

    async addSavedRecipes(email, recipe_id) {
        const user_id = await getUserIdByEmailModel(email);
        return await addsavedRecipesModel(user_id, recipe_id);
    }

    async deleteSavedRecipe(email, recipe_id) {
        const user_id = await getUserIdByEmailModel(email);
        return await deleteSavedRecipeModel(user_id, recipe_id);
    }
}

export default new savedRecipeService();