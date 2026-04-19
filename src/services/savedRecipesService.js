import { addsavedRecipesModel, deleteSavedRecipeModel, getSavedRecipeModel } from "../models/savedRecipesModel.js";

class savedRecipeService{
    async getSavedRecipes(user_id){
        return await getSavedRecipeModel(user_id);
         
    }
    async addSavedRecipes(user_id, recipe_id) {
        return await addsavedRecipesModel(user_id, recipe_id);
    }
    async deleteSavedRecipe(user_id,recipe_id){
        return await deleteSavedRecipeModel(user_id,recipe_id);
    }
}

export default new savedRecipeService();