import { supabase } from "../config/supabase.js";

//Get All Recipes
export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select('title,description,price')
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
};

//Filter Recipes
export const getFilteredRecipesModel = async (filters)=>{
  const {goal, dietary, cuisine, meal, occassion} = filters;
  let query = supabase
  .from('recipes')
  .select(`recipe_id,
    title,
    description,
    price,
    image_url,
    rating_avg,
    tags:tag_id!inner(*)
    `)
  .eq('status','published');

  if (goal) query = query.eq('tags.goal',goal);
  if (dietary) query = query.eq('tags.dietary_tags', dietary);
  if (cuisine) query = query.eq('tags.cuisine', cuisine);
  if (meal) query = query.eq('tags.meal_type',meal);
  if (occassion) query =query.eq('tags.occassion',occassion);
  const { data,error } = await query.order('created_at',{ascending:'false'});

  if (error) throw error;

  return data;
};

//CREATE - creates tags (if provided) and recipe
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

      // Set tag_id on recipe if tag was created
      // Try multiple possible PK names: id, tag_id, tags_id
      const tagId = tagRow?.id ?? tagRow?.tag_id ?? tagRow?.tags_id;
      console.log('Tag inserted:', tagRow);
      console.log('Extracted tag ID:', tagId);
      if (tagId) {
        restRecipe.tag_id = tagId;
        console.log('Set recipe.tag_id to:', tagId);
      }
    }

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
    .eq("recipe_id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// DELETE - also deletes associated tag if it exists
export const deleteRecipeModel = async (id) => {
  // 1. Get recipe to find associated tag_id
  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("tag_id")
    .eq("recipe_id", id)
    .single();

  if (fetchError) throw fetchError;

  console.log('Fetched recipe:', recipe);
  console.log('Recipe tag_id:', recipe?.tag_id);

  // 2. Delete the recipe
  const { error: deleteRecipeError } = await supabase
    .from("recipes")
    .delete()
    .eq("recipe_id", id);

  if (deleteRecipeError) throw deleteRecipeError;
  console.log('Recipe deleted with id:', id);

  // 3. Delete associated tag if tag_id exists
  if (recipe?.tag_id) {
    const { error: deleteTagError } = await supabase
      .from("tags")
      .delete()
      .eq("tag_id", recipe.tag_id);

    if (deleteTagError) {
      console.warn('Warning: Failed to delete associated tag:', deleteTagError);
      // Don't throw - recipe was successfully deleted
    } else {
      console.log('Deleted tag with tag_id:', recipe.tag_id);
    }
  } else {
    console.log('Recipe has no tag_id, skipping tag deletion');
  }

  return true;
};