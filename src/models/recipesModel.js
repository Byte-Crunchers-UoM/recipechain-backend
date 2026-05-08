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
    price_xrp: data.price
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

// src/models/recipesModel.js

export const verifyRecipeModel = async (recipeId, { status, admin_note }) => {
  // Map 'approved' to 'active' and 'rejected' to 'deactive'
  // to stay within your DB constraints: ['active', 'draft', 'deactive']
  const finalStatus = status === 'approved' ? 'active' : 'deactive';

  const { data, error } = await supabase
    .from('recipes')
    .update({ 
      approval_status: status, // Matches the process (approved/rejected)
      status: finalStatus,     // Controls marketplace visibility
      chef_note: status === 'rejected' ? admin_note : null 
    })
    .eq('recipe_id', recipeId)
    .select()
    .single();

  if (error) throw error;
  return data;
};