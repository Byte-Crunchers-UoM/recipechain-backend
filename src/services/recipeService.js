import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel
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

  async getTrendingRecipes(limit = 10, category = null) {
    const recipes = await getAllRecipesModel();

    // Filter by category if provided
    let filteredRecipes = recipes;
    if (category) {
      filteredRecipes = recipes.filter(
        (r) => r.category && r.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Constants
    const W_BUYS = 1;
    const W_LIKES = 10;
    const W_RATINGS = 20;
    const GRAVITY = 1.8;

    const now = new Date();

    const scoredRecipes = filteredRecipes.map((recipe) => {
      // 1. Normalize Rating (0-5 -> 0-1)
      const rating = parseFloat(recipe.rating) || 0;

      // Safety Filter: Exclude if rating < 2.0 (unless it has 0 rating, which might mean new? User said < 2.0)
      // Assuming 0 rating means "no rating yet" which might be fine for "new" items? 
      // But strict adherence: if rating < 2.0, exclude. 
      // If a new item has 0 rating, it will be excluded? 
      // Usually new items have 0. Let's assume explicit bad rating < 2.0. 
      // If rating is 0, is it < 2.0? Yes. 
      // A safety filter usually targets "bad" content. New content is not "bad". 
      // I'll stick to the user's "Rating < 2.0" rule. If it kills new items, that's the rule. 
      // OR, maybe 0 means undefined. 
      // Let's assume if rating > 0 and rating < 2.0 exclude.
      // If rating is 0, let it pass? 
      // "Exclude any item where the Rating is below a certain threshold (e.g. < 2.0)"
      // I will implement strictly: if (rating > 0 && rating < 2.0) return null;
      if (rating > 0 && rating < 2.0) return null;

      const ratingNorm = rating / 5;

      // 2. Metrics
      const buys = parseInt(recipe.buys) || 0;
      const likes = parseInt(recipe.likes) || 0;

      // 3. Time Decay
      const createdAt = new Date(recipe.created_at);
      // Calculate age in hours. formatting check: is created_at a string or date object?
      // Assuming ISO string from supabase, new Date() works.
      const ageInMs = now - createdAt;
      const ageInHours = Math.max(0, ageInMs / (1000 * 60 * 60));

      // 4. Calculate Score
      // Formula: (W_buys * buys + W_likes * likes + W_ratings * ratingNorm) / (Time + Gravity)^Gravity
      const numerator = (W_BUYS * buys) + (W_LIKES * likes) + (W_RATINGS * ratingNorm);
      const denominator = Math.pow(ageInHours + GRAVITY, GRAVITY);

      const score = numerator / denominator;

      return {
        ...recipe,
        heat_score: score, // valid for debugging/display
      };
    }).filter(recipe => recipe !== null);

    // Sort by score descending
    scoredRecipes.sort((a, b) => b.heat_score - a.heat_score);

    // Return top N
    return scoredRecipes.slice(0, limit);
  }

}

export default new RecipeService();
