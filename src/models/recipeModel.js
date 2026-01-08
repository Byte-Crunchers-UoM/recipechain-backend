import { supabase } from '../config/supabase.js';

export const createRecipeModel = async (recipeData) => {
    const { data, error } = await supabase
        .from('recipes')
        .insert([recipeData])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const getRecipeByIdModel = async (id) => {
    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
};

export const getAllRecipesModel = async () => {
    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
};

export const updateRecipeModel = async (id, updates) => {
    const { data, error } = await supabase
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteRecipeModel = async (id) => {
    const { data, error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};
