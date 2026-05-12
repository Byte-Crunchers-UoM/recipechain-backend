import { supabase } from "../config/supabase.js";
import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getFilteredRecipesModel
} from "../models/recipesModel.js";

class RecipeService {

  async addRecipe(recipeData) {
    const finalRecipeData = {
      ...recipeData,
      status: recipeData.status || "draft",
      approval_status: recipeData.approval_status || "pending"
    };
    
    return await addRecipeModel(finalRecipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

 
async updateRecipe(id, recipeData) {
    return await updateRecipeModel(id, recipeData);
}

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }

  async getAllRecipes(){
    const recipes = await getAllRecipesModel();
    return recipes;
  }

  async getFilteredrecipes(filters){
    const recipes = await getFilteredRecipesModel(filters);
    return recipes;
  }
}

export default new RecipeService();