import { supabase } from '../config/supabase.js';

// Data access layer - pure database operations using Supabase

export const createUserModel = async (username, email) => {
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, email }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getUserByIdModel = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
};

export const getUserByEmailModel = async (email) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const getAllUsersModel = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const updateUserModel = async (id, username, email) => {
  const { data, error } = await supabase
    .from('users')
    .update({ username, email })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteUserModel = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Fetch chef profile from sellers and social_links
export const getChefProfileModel = async (chefId) => {
    console.log('--- BACKEND DEBUG: Fetching profile for chefId:', chefId);
    
    // Fetch from sellers table
    const { data: seller, error: sellerError } = await supabase
        .from('sellers')
        .select('*')
        .eq('user_id', chefId)
        .single();

    if (sellerError) {
        if (sellerError.code !== 'PGRST116') {
            console.error('--- BACKEND DEBUG: Seller Fetch Error:', sellerError);
            throw sellerError;
        } else {
            console.log('--- BACKEND DEBUG: No seller found for this ID');
        }
    } else {
        console.log('--- BACKEND DEBUG: Seller data found:', seller.full_name);
    }

    // Fetch from social_links table
    const { data: socials, error: socialError } = await supabase
        .from('social_links')
        .select('*')
        .eq('user_id', chefId)
        .single();

    if (socialError && socialError.code !== 'PGRST116') {
        console.error('--- BACKEND DEBUG: Socials Fetch Error:', socialError);
        throw socialError;
    }
    console.log('--- BACKEND DEBUG: Socials data found:', !!socials);

    return {
        seller,
        socials
    };
};

// Increment followers_count in sellers table
export const incrementFollowersModel = async (chefId) => {
    // First get the current count
    const { data: seller, error: fetchError } = await supabase
        .from('sellers')
        .select('followers_count')
        .eq('user_id', chefId)
        .single();

    if (fetchError) {
        if (fetchError.code === 'PGRST116') {
            throw new Error('Seller not found');
        }
        throw fetchError;
    }

    const currentCount = seller.followers_count || 0;

    // Then increment it
    const { data, error } = await supabase
        .from('sellers')
        .update({ followers_count: currentCount + 1 })
        .eq('user_id', chefId)
        .select()
        .single();

    if (error) throw error;
    return data;
};
