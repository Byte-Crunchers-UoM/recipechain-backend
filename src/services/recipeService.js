import { getAllRecipesModel,getRecipesByTagModel } from "../models/recipesModel.js";
class RecipeService {
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
