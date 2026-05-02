import { supabase } from "../config/supabase.js";

// Get All Recipes 
export const getAllRecipesModel = async () => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*') // Changed from join to '*' for safety
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Supabase Error:", error.message);
    throw error;
  }
  
  
  return data.map(recipe => ({
    ...recipe,
    full_name: recipe.chef_id ? `Chef (${recipe.chef_id.substring(0, 5)})` : 'RecipeChain User',
    price_xrp: recipe.price 
  }));

};

// Filter Recipes 
export const getFilteredRecipesModel = async (filters) => {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(recipe => ({
    ...recipe,
    full_name: 'RecipeChain User'
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