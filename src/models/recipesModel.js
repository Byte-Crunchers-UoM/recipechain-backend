import { supabase } from "../config/supabase.js"

//CREATE
export const addRecipeModel = async (recipeData) => {
  const { data, error } = await supabase
    .from("recipes")
    .insert([recipeData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

//READ BY ID
export const getRecipeByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("recipe_id", id)
    .single();

  if (error) throw error;
  return data;
};

// UPDATE
export const updateRecipeModel = async (id, updateData) => {
  const { data, error } = await supabase
    .from("recipes")
    .update(updateData)
    .eq("recipe_id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// DELETE
export const deleteRecipeModel = async (id) => {
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("recipe_id", id);

  if (error) throw error;
  return true;
};

// READ ALL (for trending calculation)
export const getAllRecipesModel = async () => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, sellers (full_name)");

  if (error) {
    console.error('Error fetching recipes with sellers:', error);
    // Fallback to basic select if join fails
    const { data: basicData, error: basicError } = await supabase.from("recipes").select("*");
    if (basicError) throw basicError;
    return basicData;
  }
  return data;
};

// --- MULTI-TABLE SYNC METHODS ---

// UPSERT TRENDING RECIPE
export const upsertTrendingRecipeModel = async (trendingData) => {
  const { data, error } = await supabase
    .from("trending_recipes")
    .upsert(trendingData, { onConflict: "recipe_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// BULK UPSERT TRENDING RECIPES
export const bulkUpsertTrendingRecipesModel = async (trendingDataArray) => {
  const { data, error } = await supabase
    .from("trending_recipes")
    .upsert(trendingDataArray, { onConflict: "recipe_id" });

  if (error) throw error;
  return data;
};

// GET TRENDING DATA FROM TABLE
export const getTrendingFromTableModel = async (limit = 100) => {
  const { data, error } = await supabase
    .from("trending_recipes")
    .select(`
      *,
      recipes (
        *,
        sellers (full_name)
      )
    `)
    .order("heat_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching from trending_recipes table:', error);
    throw error;
  }
  return data;
};

// GET CHEF ID BY RECIPE ID
export const getChefIdByRecipeIdModel = async (recipeId) => {
  const { data, error } = await supabase
    .from("chef_records")
    .select("chef_id")
    .eq("recipe_id", recipeId)
    .single();

  if (error) return null; // Handle missing chef record gracefully
  return data?.chef_id;
};

// GET BUYER COUNT BY RECIPE ID
export const getBuyerCountByRecipeIdModel = async (recipeId) => {
  const { count, error } = await supabase
    .from("buyers")
    .select("*", { count: "exact", head: true })
    .eq("recipe_id", recipeId);

  if (error) throw error;
  return count || 0;
};

export const getRecipesByChefIdModel = async (chefId) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, tags(tag_id, dietary_tags)')
    .eq('chef_id', chefId);

  if (error) throw error;
  return data;
};

// FETCH ALL FEEDBACKS FOR AGGREGATION
export const getAllFeedbacksModel = async () => {
  const { data, error } = await supabase
    .from("feedbacks")
    .select("recipe_id, rating");
  if (error) throw error;
  return data;
};

// FETCH ALL PURCHASES FOR AGGREGATION
export const getAllPurchasesModel = async () => {
  const { data, error } = await supabase
    .from("recipe_purchases")
    .select("recipe_id, unlocked_at");
  if (error) throw error;
  return data;
};