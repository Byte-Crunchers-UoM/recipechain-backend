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