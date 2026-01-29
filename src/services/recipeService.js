import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getRecipesByTagModel
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
    async getRecipesByTag(tagsArray){
        const recipes = await getRecipesByTagModel(tagsArray);
        const flattenedRecipes = recipes.map(recipe=>{
            return{
                id:recipe.id,
                title:recipe.title,
                description:recipe.description,
                price:recipe.price,
                tags:recipe.recipe_tags.map(item => item.tags.name)
            }
        })
        return flattenedRecipes;

    }

}

export default new RecipeService();
