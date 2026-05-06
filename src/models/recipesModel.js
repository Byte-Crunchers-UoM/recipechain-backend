//src/models/savedRecipeModel.js

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
    //.eq('approval_status', 'published')
    .order('created_at',{ascending:false});
    
    if (error) throw error 
    return data;
};

/**
 * Database Model: Fetches recipes based on dynamic category filters
 * and joins the required tag constraints.
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
    .eq('approval_status', 'published');

  if(difficulty_level) query = query.ilike('difficulty_level', difficulty_level)
  if (goal) query = query.ilike('tags.goal', goal);
  if (dietary_tags) query = query.ilike('tags.dietary_tags', dietary_tags);
  if (cuisine) query = query.ilike('tags.cuisine', cuisine);
  if (meal_type) query = query.ilike('tags.meal_type', meal_type);
  if (occasion) query = query.ilike('tags.occasion', occasion);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

// Search Recipes (Updated for better partial matching)
export const searchRecipesModel = async (searchTerm) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, sellers:chef_id(full_name, display_name)') 
    .eq('approval_status', 'published')
    .ilike('title', `%${searchTerm}%`); 
  if (error) throw error;
  return data;
};

/**
 * Database Model: Inserts a newly created recipe into the database.
 */
export const addRecipeModel = async (recipeData) =>{
    const {data,error} = await supabase
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
    const {data,error} = await supabase
    .from("recipes")
    .select("*")
    .eq("recipe_id",id)
    .single();

    if(error) throw error;
    return data;
};

/**
 * Database Model: Applies updates to an existing recipe's database row.
 */
export const updateRecipeModel = async (id, updateData) => {
  const { data, error } = await supabase
    .from("recipes")
    .update(updateData)
    .eq("id", id)
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
    .eq("id", id);

  if (error) throw error;
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