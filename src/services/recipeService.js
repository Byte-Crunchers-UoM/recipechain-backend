import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getFilteredRecipesModel,
  searchRecipesModel
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
  async getAllRecipes(){
        const recipes = await getAllRecipesModel();
        return recipes;
    }
  async getFilteredrecipes(filters){
    const recipes = await getFilteredRecipesModel(filters);
    return recipes;
  }

  async searchRecipes(searchTerm) {
    const recipes = await searchRecipesModel(searchTerm);
    return recipes;
  }
}

export default new RecipeService();
