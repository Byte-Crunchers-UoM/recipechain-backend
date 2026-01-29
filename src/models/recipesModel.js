import { supabase } from "../config/supabase.js";

export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select('title,description,price')
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
};


export const getRecipesByTagModel =async(tagsArray)=>{
    const requiredTagCount = tagsArray.length;
    const{data,error} = await supabase
    .from('recipes')
    .select(`
            recipe_id,
            title,
            description,
            price,
            recipe_tags!inner(tags!inner(name))
            `)
    
    .in('recipe_tags.tags.name', tagsArray)
    .eq('status','published')
    .order('created_at', {ascending:false});
        
    if(error) throw error
    const filteredData = data.filter(recipe=>{
        const matchingTagsCount = recipe.recipe_tags.length;
        return matchingTagsCount === requiredTagCount;
    })

        
    return filteredData;
}
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
    .eq("id",id)
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