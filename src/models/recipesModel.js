import { supabase } from "../config/supabase.js";

export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select('title,description,price')
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
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
  const { data,error } = await query.order('created_at',{ascending:false});

  if (error) throw error;

  return data;
};

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
    const {data,error} = await supabase
    .from("recipes")
    .select("*")
    .eq("recipe_id",id)
    .single();

    if(error) throw error;
    return data;
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