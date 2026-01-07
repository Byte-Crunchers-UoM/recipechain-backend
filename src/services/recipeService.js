import { getAllRecipesModel,getRecipesByTagModel } from "../models/recipesModel.js";
class RecipeService {
    async getAllRecipes(){
        const recipes = await getAllRecipesModel();
        return recipes;
    }
    async getRecipesByTag(tag){
        const recipes = await getRecipesByTagModel(tag);
        return recipes;

    }

}
export default new RecipeService();
