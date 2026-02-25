import { supabase } from "../config/supabase.js";

//Get All Recipes
export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select(`*,
      sellers!inner(full_name)`)
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
};

export const getFilteredRecipesModel = async (filters) => {
  const { goal, dietary, cuisine, meal_type, occasion } = filters;
  
  let query = supabase
    .from('recipes')
    .select(`
      recipe_id,
      title,
      description,
      price,
      image_url,
      rating_avg,
      seller:chef_id (
        full_name,
        display_name
      ),
      tags:tag_id!inner (*)
    `)
    .eq('status', 'published');

  // Filtering Logic - ensuring column names match the 'tags' table
  if (goal) query = query.eq('tags.goal', goal);
  if (dietary) query = query.eq('tags.dietary_tags', dietary);
  if (cuisine) query = query.eq('tags.cuisine', cuisine);
  if (meal_type) query = query.eq('tags.meal_type', meal_type);
  if (occasion) query = query.eq('tags.occasion', occasion);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

//CREATE
export const addRecipeModel = async (recipeData) =>{
    const {data,error} = await supabase
    .from("recipes")
    .insert([recipeData])
    .select()
    .single();

    if (error) throw error;
    return data;
};

//READ BY ID
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