import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  upsertTrendingRecipeModel,
  bulkUpsertTrendingRecipesModel,
  getTrendingFromTableModel,
  getAllFeedbacksModel,
  getAllPurchasesModel,
  getChefIdByRecipeIdModel,
  getBuyerCountByRecipeIdModel,
  getRecipesByChefIdModel
} from "../models/recipesModel.js";

class RecipeService {

  async addRecipe(recipeData) {
    return await addRecipeModel(recipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  async updateRecipe(id, updateData) {
    // 1. Update the core recipe data
    const updatedRecipe = await updateRecipeModel(id, updateData);

    // 2. Aggregate data from other tables
    const chefId = await getChefIdByRecipeIdModel(id);
    const buyerCount = await getBuyerCountByRecipeIdModel(id);

    // 3. Calculate latest heat score
    const enrichedRecipe = this._calculateRecipeScore({
      ...updatedRecipe,
      buys: buyerCount
    });

    // 4. Sync with trending_recipes table
    // If enrichedRecipe is null (filtered out), we still might want to track basic metrics
    // but the user expects the heat_score to be working.
    const heatScore = enrichedRecipe ? enrichedRecipe.heat_score : 0;

    await upsertTrendingRecipeModel({
      recipe_id: id,
      chef_id: chefId,
      created_at: updatedRecipe.created_at,
      rating_avg: updatedRecipe.average_rating || updatedRecipe.rating || 0,
      purchase_count: buyerCount,
      heat_score: heatScore
    });

    return enrichedRecipe || { ...updatedRecipe, purchase_count: buyerCount, heat_score: 0 };
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }

  _calculateRecipeScore(recipe) {
    if (!recipe) return null;

    // Weights and Constants
    const W_BUYS = 10;
    const W_RATINGS = 20;
    const GRAVITY = 1.5;
    const TIME_OFFSET = 2;

    const now = new Date();

    // Metrics Extraction
    const buysCount = Array.isArray(recipe.buys)
      ? recipe.buys.length
      : (parseInt(recipe.buys) || 0);

    const avgRating = parseFloat(recipe.average_rating) || parseFloat(recipe.rating) || 0;
    const ratingCount = parseInt(recipe.rating_count) || (avgRating > 0 ? 1 : 0);

    // Safety Filter: Exclude score calculation if rating average < 2.0
    // But we still return the metrics
    if (avgRating > 0 && avgRating < 2.0) {
      return {
        ...recipe,
        purchase_count: buysCount,
        heat_score: 0,
      };
    }

    // Time Decay
    const createdAt = recipe.created_at ? new Date(recipe.created_at) : new Date();
    const ageInMs = now - createdAt;
    const ageInHours = Math.max(0, ageInMs / (1000 * 60 * 60));

    // Calculate Score
    // Formula: Score = ((buys * 10) + (Avg Rating * Rating Count * 20)) / (Hours since posted + 2)^1.5
    const numerator = (buysCount * W_BUYS) + (avgRating * ratingCount * W_RATINGS);
    const denominator = Math.pow(ageInHours + TIME_OFFSET, GRAVITY);

    const score = isNaN(numerator / denominator) ? 0 : (numerator / denominator);

    return {
      ...recipe,
      purchase_count: buysCount,
      heat_score: score,
      chef_name: recipe.sellers ? recipe.sellers.full_name : (recipe.chef_name || 'Chef')
    };
  }

  async getTrendingRecipes(limit = 100, category = null) {
    try {
      console.log('--- DEBUG: Starting trending aggregation...');
      
      // 1. Fetch all necessary data in parallel
      const [recipes, feedbacks, purchases] = await Promise.all([
        getAllRecipesModel(),
        getAllFeedbacksModel(),
        getAllPurchasesModel()
      ]).catch(err => {
        console.error('--- DEBUG: Error in Promise.all during model fetch:', err.message);
        throw err;
      });

      console.log(`--- DEBUG: Fetched ${recipes.length} recipes, ${feedbacks.length} feedbacks, ${purchases.length} purchases.`);

      // 2. Group feedbacks and purchases by recipe_id for easy lookup
      const feedbacksByRecipe = (feedbacks || []).reduce((acc, fb) => {
        if (fb && fb.recipe_id) {
          if (!acc[fb.recipe_id]) acc[fb.recipe_id] = [];
          acc[fb.recipe_id].push(fb.rating);
        }
        return acc;
      }, {});

      const purchasesByRecipe = (purchases || []).reduce((acc, p) => {
        if (p && p.recipe_id) {
          if (!acc[p.recipe_id]) acc[p.recipe_id] = [];
          acc[p.recipe_id].push(p.unlocked_at);
        }
        return acc;
      }, {});

      // 3. Process and aggregate data for each recipe
      const trendingData = recipes.map(recipe => {
        const recipeId = recipe.recipe_id;
        
        // Calculate Purchase Count
        const purchaseTimes = purchasesByRecipe[recipeId] || [];
        const purchaseCount = purchaseTimes.length;

        // Only proceed if purchase_count >= 1 ---
        if (purchaseCount < 1) return null;

        // Calculate Rating Average
        const ratings = feedbacksByRecipe[recipeId] || [];
        const ratingAvg = ratings.length > 0 
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
          : 0;

        // Get Latest Purchase Timestamp for created_at
        const latestPurchase = new Date(Math.max(...purchaseTimes.map(t => new Date(t))));

        // 4. Calculate Heat Score
        let heatScore = 0;
       
        const scored = this._calculateRecipeScore({
          ...recipe,
          average_rating: ratingAvg,
          rating_count: ratings.length,
          buys: purchaseCount,
          created_at: latestPurchase
        });
        heatScore = scored ? scored.heat_score : 0;

        return {
          recipe_id: recipeId,
          chef_id: recipe.chef_id || null,
          created_at: latestPurchase,
          rating_avg: ratingAvg,
          purchase_count: purchaseCount,
          heat_score: heatScore
        };
      }).filter(item => item !== null); // Remove recipes with 0 purchases

      // 5. Bulk Upsert into trending_recipes table
      try {
        const safeNum = (val) => (typeof val === 'number' && !isNaN(val) && isFinite(val)) ? val : 0;

        // Filter to only include columns that exist in the database table
        const dbPayload = trendingData.map(item => ({
          recipe_id: item.recipe_id,
          chef_id: item.chef_id,
          created_at: item.created_at,
          rating_avg: safeNum(item.rating_avg),
          purchase_count: Math.round(safeNum(item.purchase_count)),
          heat_score: safeNum(item.heat_score)
        }));

        await bulkUpsertTrendingRecipesModel(dbPayload);
        console.log(`--- DEBUG: Successfully synced ${dbPayload.length} recipes to trending_recipes table.`);
      } catch (err) {
        console.error('--- DEBUG: Sync to trending_recipes table failed:', err.message);
      }

      // 6. Fetch final sorted data from the table
      try {
        console.log('--- DEBUG: Fetching from trending_recipes table...');
        const tableData = await getTrendingFromTableModel(limit);
        console.log(`--- DEBUG: Successfully fetched ${tableData.length} rows from trending_recipes table.`);
        
        let finalRecipes = tableData.map(row => {
          const recipe = row.recipes;
          if (!recipe) {
            console.warn(`--- DEBUG: No recipe data joined for trending record:`, row.recipe_id);
            return null;
          }
          return {
            ...recipe,
            heat_score: row.heat_score || 0,
            purchase_count: row.purchase_count || 0,
            average_rating: row.rating_avg || 0, // Map to average_rating for frontend
            rating_avg: row.rating_avg || 0,
            created_at: row.created_at,
            chef_name: recipe.sellers ? recipe.sellers.full_name : (recipe.chef_name || 'Chef')
          };
        }).filter(r => r !== null);

        if (category && category.toLowerCase() !== 'all') {
          finalRecipes = finalRecipes.filter(
            (r) => 
              (r.category && r.category.toLowerCase() === category.toLowerCase()) ||
              (r.difficulty_level && r.difficulty_level.toLowerCase() === category.toLowerCase())
          );
        }

        return finalRecipes;

      } catch (err) {
        console.error('--- DEBUG: Fetch from trending_recipes table failed:', err.message);
        throw err; // Re-throw to be caught by the outer catch
      }

    } catch (err) {
      console.error('--- FATAL ERROR in getTrendingRecipes:', err.message);
      throw err;
    }
  }

  async getRecipesByChef(chefId) {
    if (!chefId) {
      throw new Error('Chef ID is required');
    }
    return await getRecipesByChefIdModel(chefId);
  }

}

export default new RecipeService();
