import { supabase } from "../config/supabase.js";

export const getUserIdByEmailModel = async (email) => {
    const { data, error } = await supabase
        .from('users') 
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("User not found");
    
    return data.user_id; 
};

export const getSavedRecipeModel = async (user_id) => {
    const { data, error } = await supabase
        .from('saved_recipes')
        .select(`recipe_id,
                 created_at,
                 recipes(*)`)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    return data;
};

export const addsavedRecipesModel = async (user_id, recipe_id) => {
    const { data, error } = await supabase
        .from('saved_recipes')
        .insert([{ user_id: user_id, recipe_id: recipe_id }])
        .select();

    if (error) throw error;
    return true;
};

export const deleteSavedRecipeModel = async (user_id, recipe_id) => {
    const { data, error } = await supabase
        .from('saved_recipes')
        .delete()
        .match({ user_id: user_id, recipe_id: recipe_id });

    if (error) throw error;
    return true;
};