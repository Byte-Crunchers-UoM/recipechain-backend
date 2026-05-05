import { supabase } from "../config/supabase.js";

// 🛠️ DELETED: getUserIdByEmailModel is gone!

export const getSavedRecipeModel = async (user_id) => {
    const { data, error } = await supabase
        .from('saved_recipes')
        .select(`
            saved_id,
            recipe_id,
            created_at,
            recipes (
                title,
                image_url,
                prep_time,
                difficulty_level,
                price
            )
        `)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false }); 

    if (error) throw error;
    return data;
};

export const addsavedRecipesModel = async (user_id, recipe_id) => {
    const { data, error } = await supabase
        .from('saved_recipes')
        .insert([{ user_id, recipe_id }])
        .select()
        .single();
        
    if (error) throw error;
    return data;
};

export const deleteSavedRecipeModel = async (user_id, recipe_id) => {
    const { error } = await supabase
        .from('saved_recipes')
        .delete()
        .eq('user_id', user_id)
        .eq('recipe_id', recipe_id);
        
    if (error) throw error;
    return true;
};