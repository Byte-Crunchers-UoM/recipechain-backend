import { supabase } from "../config/supabase.js";

export const getAllRecipesModel = async()=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select('title,description')
    .order('created_at',{ascending:false});
    if (error) throw error 
    return data;
};

export const getRecipesByTagModel = async(tag)=>{
    const{ data,error } = await supabase
    .from ('recipes')
    .select ('title,description')
    .ilike ('tag',tag)
    .order('created_at',{ascending:false});
    if (error) throw error
    return data;

};