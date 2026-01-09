import { supabase } from '../config/supabase.js';

// Data access layer - pure database operations using Supabase

export const createUserModel = async (username, email) => {
  const { data, error } = await supabase
    .from('profiles')
    .insert([{ username, email }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getUserByIdModel = async (id) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
};

export const getUserByEmailModel = async (email) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const getAllUsersModel = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const updateUserModel = async (id, username, email) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ username, email })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteUserModel = async (id) => {
  const { data, error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};
