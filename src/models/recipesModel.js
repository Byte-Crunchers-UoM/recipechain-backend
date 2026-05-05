//src/models/savedRecipeModel.js

import { supabase } from "../config/supabase.js";

//Get All Recipes
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

//Recipe Filtering
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
//search Recipes
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