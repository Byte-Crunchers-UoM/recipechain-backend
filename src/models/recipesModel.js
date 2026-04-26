import { supabase } from "../config/supabase.js";

// Get All Recipes
export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select(`*,
      sellers!inner(full_name)`)
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
};

// Recipe Filtering
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
    .eq('status', 'published');

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

// Search Recipes
export const searchRecipesModel = async (searchTerm) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, sellers(full_name)')
    .eq('status', 'published')
    .textSearch('title', searchTerm, {
      type: 'websearch',
      config: 'english'
    });

  if (error) throw error;
  return data;
};

// CREATE
export const addRecipeModel = async (recipeData) =>{
    const {data,error} = await supabase
    .from("recipes")
    .insert([recipeData])
    .select()
    .single();

    if (error) throw error;
    return data;
};

// READ BY ID
export const getRecipeByIdModel = async (id) => {
    const {data,error} = await supabase
    .from("recipes")
    .select("*")
    .eq("recipe_id",id)
    .single();

    if(error) throw error;
    return data;
};

// UPDATE
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

// DELETE
export const deleteRecipeModel = async (id) => {
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
};

// (Add this below the existing code)

// Get the Recipe along with the Seller's details
export const getRecipeWithSellerModel = async (recipeId) => {
    const { data, error } = await supabase
        .from('recipes')
        .select('*, sellers(user_id)') 
        .eq('recipe_id', recipeId) 
        .single();
    if (error) throw error;
    return data;
};

// Save the Payment record
export const savePaymentRecordModel = async (paymentData) => {
    const { data, error } = await supabase
        .from('payments') 
        .insert([paymentData])
        .select('payment_id') // Get the newly created ID
        .single();
    if (error) throw error;
    return data;
};

// Save the Recipe Purchase (Access) record
export const saveRecipePurchaseModel = async (purchaseData) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .insert([purchaseData]);
    if (error) throw error;
    return data;
};

// Get the Seller's Wallet Address
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
    return !!data; // Returns true if data exists, false otherwise
};

// Get the IDs of the Recipes purchased by a User
export const getUserPurchasesModel = async (userId) => {
    const { data, error } = await supabase
        .from('recipe_purchases')
        .select('recipe_id')
        .eq('buyer_id', userId);
    
    if (error) throw error;
    return data || []; // Ex: [{ recipe_id: '123' }, { recipe_id: '456' }]
};