import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getFilteredRecipesModel,
  verifyRecipeModel
} from "../models/recipesModel.js";

class RecipeService {

  async addRecipe(recipeData) {
    return await addRecipeModel(recipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  async updateRecipe(id, updateData) {
    return await updateRecipeModel(id, updateData);
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }

  async verifyRecipe(id, verificationData) {
    // We pass the logic to the model to handle the Supabase update
    return await verifyRecipeModel(id, verificationData);
  }

  async getAllRecipes(){
    // This will now successfully return the recipe_id and full_name 
    // because of the changes we made to your Model earlier.
    return await getAllRecipesModel();
  }

  // FIXED: Changed 'r' to 'R' to match standard naming and Controller calls
  async getFilteredRecipes(filters){ 
    return await getFilteredRecipesModel(filters);
  }
}

export default new RecipeService();