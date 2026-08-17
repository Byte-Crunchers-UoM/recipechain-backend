import { supabase } from "../config/supabase.js";

/**
 * Database Model: Fetches all published recipes with pagination.
 */
export const getAllRecipesModel = async (from, to) => {
  const { data, count, error } = await supabase
    .from('recipes')
    .select(`
      *,
      sellers!inner(full_name),
      feedbacks(
        *,
        feedback_images(*)
      )
    `, { count: 'exact' }) 
    .eq('status', 'active')
    .eq('approval_status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to); 
    
  if (error) throw error; 

  const formattedData = data.map(recipe => ({
    ...recipe,
    full_name: recipe.sellers?.full_name || "RecipeChain User",
    price_xrp: recipe.price,
    feedbacks: recipe.feedbacks?.map(feedback => ({
      ...feedback,
      feedback_images: feedback.feedback_images || []
    })) || []
  }));

  return { data: formattedData, totalCount: count };
};

/**
 * Database Model: Fetches recipes based on dynamic category filters
 */
export const getFilteredRecipesModel = async (filters) => {
  const { difficulty_level, goal, dietary_tags, cuisine, meal_type, occasion } = filters;
  
  let query = supabase
    .from('recipes')
    .select(`
      *,
      sellers:chef_id (
        full_name,
        display_name
      ),
      tags:tag_id!inner (*)
    `)
    .eq('status', 'active')
    .eq('approval_status', 'published');

  if (difficulty_level) query = query.ilike('difficulty_level', difficulty_level);
  if (goal) query = query.ilike('tags.goal', goal);
  if (dietary_tags) query = query.ilike('tags.dietary_tags', dietary_tags);
  if (cuisine) query = query.ilike('tags.cuisine', cuisine);
  if (meal_type) query = query.ilike('tags.meal_type', meal_type);
  if (occasion) query = query.ilike('tags.occasion', occasion);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

// Search Recipes 
export const searchRecipesModel = async (searchTerm) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, sellers:chef_id(full_name, display_name)') 
    .eq('status', 'active')
    .eq('approval_status', 'published')
    .ilike('title', `%${searchTerm}%`); 
    
  if (error) throw error;
  return data;
};

/**
 * Database Model: Inserts a newly created recipe into the database.
 */
export const addRecipeModel = async (recipeData) =>{
    const { data, error } = await supabase
      .from("recipes")
      .insert([recipeData])
      .select()
      .single();

  if (error) throw error;
  return data;
};

/**
 * Database Model: Retrieves a single recipe configuration strictly by ID.
 */
export const getRecipeByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, sellers(full_name)")
    .eq("recipe_id", id)
    .single();

  if (error) throw error;

  return {
    ...data,
    full_name: data.sellers?.full_name || "RecipeChain User",
    price_xrp: data.price,
    rejection_reason: data.rejection_reason
  };
};

/**
 * Database Model: Applies updates to an existing recipe's database row.
 */
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

/**
 * Database Model: Hard deletes a recipe from the database.
 */
export const deleteRecipeModel = async (id) => {
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("recipe_id", id);

  if (error) throw error;
  return true;
};

// READ ALL (for trending calculation)
export const getAllRecipesForTrendingModel = async () => {
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

// UPSERT TRENDING RECIPE
export const upsertTrendingRecipeModel = async (trendingData) => {
  // Delete existing record first to ensure no duplicates in the database
  await supabase
    .from("trending_recipes")
    .delete()
    .eq("recipe_id", trendingData.recipe_id);

  const { data, error } = await supabase
    .from("trending_recipes")
    .insert([trendingData])
    .select()
    .single();

  if (error) {
    // Fallback if insert fails
    const { data: upsertData, error: upsertError } = await supabase
      .from("trending_recipes")
      .upsert(trendingData, { onConflict: "recipe_id" })
      .select()
      .single();
    if (upsertError) throw upsertError;
    return upsertData;
  }
  return data;
};

// BULK UPSERT TRENDING RECIPES
export const bulkUpsertTrendingRecipesModel = async (trendingDataArray) => {
  if (!trendingDataArray || trendingDataArray.length === 0) return [];

  // Delete existing records first to ensure no duplicates in the database
  const recipeIds = trendingDataArray.map(t => t.recipe_id);
  const batchSize = 100;
  for (let i = 0; i < recipeIds.length; i += batchSize) {
    const batchIds = recipeIds.slice(i, i + batchSize);
    await supabase
      .from("trending_recipes")
      .delete()
      .in("recipe_id", batchIds);
  }

  const { data, error } = await supabase
    .from("trending_recipes")
    .insert(trendingDataArray);

  if (error) {
    console.error("--- DEBUG INSERT ERROR:", error);
    throw error;
  }
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

/**
 * Database Model: Retrieves a recipe along with its creator/seller ID.
 */
export const getRecipeWithSellerModel = async (recipeId) => {
    const { data, error } = await supabase
        .from('recipes')
        .select('*, sellers(user_id)') 
        .eq('recipe_id', recipeId) 
        .single();
    if (error) throw error;
    return data;
};

/**
 * Database Model: Bulk-inserts the per-recipe breakdown rows for a batch payment.
 */
export const savePaymentItemsModel = async (items) => {
    const { data, error } = await supabase
        .from('payment_items')
        .insert(items)
        .select();

    if (error) throw error;
    return data;
};

/**
 * Database Model: Inserts a record of a successful crypto payment into the DB.
 */
export const savePaymentRecordModel = async (paymentData) => {
    const { data, error } = await supabase
        .from('payments') 
        .insert([paymentData])
        .select('payment_id') // Get the newly created ID
        .single();
    if (error) throw error;
    return data;
};

/**
 * Database Model: Grants permanent access to a recipe by inserting a row
 * into the recipe_purchases relation table.
 */
export const saveRecipePurchaseModel = async (purchaseData) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .insert([purchaseData]);
    if (error) throw error;
    return data;
};

/**
 * Database Model: Fetches a seller's connected XRPL wallet address
 * to facilitate payout routing.
 */
export const getSellerWalletModel = async (sellerId) => {
    const { data, error } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('user_id', sellerId)
        .single();
    if (error) throw error;
    return data;
};

// Check if a User has purchased a Recipe
export const checkPurchaseStatusModel = async (buyerId, recipeId) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .select('purchase_id')
        .eq('buyer_id', buyerId)
        .eq('recipe_id', recipeId)
        .single();
    
    if (error && error.code !== 'PGRST116') { 
        throw error;
    }
    return !!data; 
};

// Get the IDs of the Recipes purchased by a User
export const getUserPurchasesModel = async (userId) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .select('recipe_id')
        .eq('buyer_id', userId);
    
    if (error) throw error;
    return data || []; 
};

export const verifyRecipeModel = async (recipeId, { approval_status, rejection_reason }) => {
  const { data, error } = await supabase
    .from('recipes')
    .update({ 
      approval_status: approval_status, 
      rejection_reason: approval_status === 'rejected' ? rejection_reason : null 
    })
    .eq('recipe_id', recipeId)
    .select()
    .single();

  if (error) {
    console.error("Database Update Error:", error.message);
    throw error;
  }
  
  return data;
};

/**
 * Database Model: Fetches a set of recipes by ID, with seller info,
 * for batch checkout price calculation.
 */
export const getRecipesByIdsModel = async (recipeIds) => {
    const { data, error } = await supabase
        .from('recipes')
        .select('recipe_id, title, price, chef_id, status, sellers(user_id)')
        .in('recipe_id', recipeIds);

    if (error) throw error;
    return data || [];
};

/**
 * Database Model: Returns just the recipe_ids (from a given list) that
 * this buyer has already purchased — used to exclude already-owned items
 * from a batch charge.
 */
export const getPurchasedRecipeIdsModel = async (buyerId, recipeIds) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .select('recipe_id')
        .eq('buyer_id', buyerId)
        .in('recipe_id', recipeIds);

    if (error) throw error;
    return (data || []).map((row) => row.recipe_id);
};

/**
 * Database Model: Checks whether a given XRPL transaction hash has already
 * been recorded as a payment. Powers idempotent batch-unlock requests.
 */
export const getExistingPaymentByHashModel = async (transactionHash) => {
    const { data, error } = await supabase
        .from('payments')
        .select('payment_id, batch_id')
        .eq('payment_hash', transactionHash)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
};