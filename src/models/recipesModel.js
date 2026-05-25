import { supabase } from "../config/supabase.js";

// Get All Recipes
export const getAllRecipesModel = async () => {
  const { data, error } = await supabase
    .from("recipes")
    .select(`
      *,
      sellers (
        full_name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase Error:", error.message);
    throw error;
  }

  return data.map(recipe => ({
    ...recipe,
    full_name: recipe.sellers?.full_name || "RecipeChain User",
    price_xrp: recipe.price
  }));
};

// Filter Recipes
export const getFilteredRecipesModel = async (filters) => {
  const { data, error } = await supabase
    .from("recipes")
    .select(`
      *,
      sellers (
        full_name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.map(recipe => ({
    ...recipe,
    full_name: recipe.sellers?.full_name || "RecipeChain User",
    price_xrp: recipe.price
  }));
};

// CREATE
export const addRecipeModel = async (recipeData) => {
  const { data, error } = await supabase
    .from("recipes")
    .insert([recipeData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// READ BY ID
export const getRecipeByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("recipes")
    .select(`
      *,
      sellers (
        full_name
      )
    `)
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