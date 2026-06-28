//src/models/recipesModel.js

import { supabase } from "../config/supabase.js";

/**
 * Database Model: Fetches all published recipes from Supabase,
 * including the seller's full name.
 */
export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select(`*,
      sellers!inner(full_name)`)
    .eq('status', 'active')
    .order('created_at',{ascending:false});
    
    if (error) throw error 
   return data.map(recipe => ({
      ...recipe,
      full_name: recipe.sellers?.full_name || "RecipeChain User",
      price_xrp: recipe.price
    }));
};

export const getFilteredRecipesModel = async (filters)=>{
  const {goal, dietary, cuisine, meal, occasion} = filters;
  let query = supabase
  .from('recipes')
  .select(`recipe_id,
    title,
    description,
    price,
    image_url,
    rating_avg,
    tags!inner(*)
    `)
  .eq('status','published');

  if (goal) query = query.eq('tags.goal', goal);
  if (dietary) query = query.eq('tags.dietary_tags', dietary);
  if (cuisine) query = query.eq('tags.cuisine', cuisine);
  if (meal) query = query.eq('tags.meal_type', meal);
  if (occasion) query = query.eq('tags.occasion', occasion);
  
  if(difficulty_level) query = query.ilike('difficulty_level', difficulty_level)
  if (goal) query = query.ilike('tags.goal', goal);
  if (dietary_tags) query = query.ilike('tags.dietary_tags', dietary_tags);
  if (cuisine) query = query.ilike('tags.cuisine', cuisine);
  if (meal_type) query = query.ilike('tags.meal_type', meal_type);
  if (occasion) query = query.ilike('tags.occasion', occasion);
  
const { data, error } = await query.order('created_at', { ascending: false });


}

// Search Recipes (Updated for better partial matching)
export const searchRecipesModel = async (searchTerm) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, sellers:chef_id(full_name, display_name)') 
    .eq('status', 'active')
    .ilike('title', `%${searchTerm}%`); 
  if (error) throw error;
  return data;
};

/**
 * Database Model: Inserts a newly created recipe into the database.
 */
export const addRecipeModel = async (recipeData) =>{
  const { tags, ...restRecipe } = recipeData;
  let tagRow = null;

  try {
    const hasNonEmptyTag = tags && Object.values(tags).some(v => {
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      return String(v).trim() !== '';
    });

    if (hasNonEmptyTag) {
      const {
        dietary_tags = null,
        goal = null,
        meal_type = null,
        occasion = null,
        cuisine = null
      } = tags;

      const tagPayload = { dietary_tags, goal, meal_type, occasion, cuisine };
      const { data: insertedTag, error: tagError } = await supabase
        .from('tags')
        .insert([tagPayload])
        .select()
        .single();

      if (tagError) throw tagError;
      tagRow = insertedTag;

      const tagId = tagRow?.id ?? tagRow?.tag_id ?? tagRow?.tags_id;
      if (tagId) {
        restRecipe.tag_id = tagId;
      }
    }

    restRecipe.ingredients = restRecipe.ingredients || [];
    restRecipe.instructions = restRecipe.instructions || [];

    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert([restRecipe])
      .select()
      .single();

    if (recipeError) throw recipeError;
    return { recipe, tag: tagRow };
  } catch (error) {
    throw error;
  }
};

export const getRecipeByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, sellers(full_name)")
    .eq("recipe_id",id)
    .single();

  if (error) throw error;

  return {
    ...data,
    full_name: data.sellers?.full_name || "RecipeChain User",
    price_xrp: data.price,
    rejection_reason: data.rejection_reason
  };
};

export const updateRecipeModel = async (id, updateData) => {
  const { tags, ...restRecipe } = updateData; 

  try {

    const { data: existingRecipe, error: fetchError } = await supabase
      .from("recipes")
      .select("tag_id")
      .eq("recipe_id", id)
      .single();

    if (fetchError) throw fetchError;

    if (tags && existingRecipe.tag_id) {
      const { error: tagUpdateError } = await supabase
        .from("tags")
        .update({
          dietary_tags: tags.dietary_tags,
          goal: tags.goal,
          meal_type: tags.meal_type,
          occasion: tags.occasion,
          cuisine: tags.cuisine
        })
        .eq("tag_id", existingRecipe.tag_id);

      if (tagUpdateError) throw tagUpdateError;
    }


    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .update(restRecipe)
      .eq("recipe_id", id)
      .select()
      .single();

    if (recipeError) throw recipeError;
    return recipe;

  } catch (error) {
    throw error;
  }
};

export const updateRecipeTagsModel = async (tagId, tags) => {
  if (!tagId || !tags) return;

  const { error } = await supabase
    .from('tags')
    .update({
      dietary_tags: tags.dietary_tags,
      goal: tags.goal,
      meal_type: tags.meal_type,
      occasion: tags.occasion,
      cuisine: tags.cuisine
    })
    .eq('tag_id', tagId); 

  if (error) throw error;
  return true;
};
export const deleteRecipeModel = async (id) => {
  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("tag_id")
    .eq("recipe_id", id)
    .single();

  if (fetchError) throw fetchError;

  if (recipe?.tag_id) {
    const { error: deleteTagError } = await supabase
      .from("tags")
      .delete()
      .eq("tag_id", recipe.tag_id);

    if (deleteTagError) {
      console.warn('Warning: Failed to delete associated tag:', deleteTagError);
    }
  }

  const { error: deleteRecipeError } = await supabase
    .from("recipes")
    .delete()
    .eq("recipe_id", id);

  if (deleteRecipeError) throw deleteRecipeError;

  return true;
};

// (Add this below the existing code)

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
    
    if (error && error.code !== 'PGRST116') { // PGRST116 means "No rows found"
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
      // 1. Only update the administrative status
      approval_status: approval_status, 
      
      // 2. Only save the reason if the status is 'rejected'
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