import { supabase } from '../config/supabase.js';

/**
 * Fetches the list of chefs followed by a specific user.
 * Joins with the sellers table to get chef names and details.
 */
export const getFollowedChefsModel = async (followerId) => {
    const { data, error } = await supabase
        .from('followed_chefs')
        .select(`
            chef_id,
            sellers!inner (
                full_name,
                user_id
            )
        `)
        .eq('follower_id', followerId);

    if (error) {
        // Handle cases where the table doesn't exist or is missing from schema cache
        if (error.code === 'PGRST116' || error.code === '42P01' || (error.message && error.message.includes('schema cache'))) {
            console.warn(`Followed_chefs table not accessible: ${error.message}`);
            return [];
        }
        throw error;
    }

    // Flatten the response
    return data.map(item => ({
        id: item.chef_id,
        name: item.sellers.full_name,
        user_id: item.sellers.user_id,
        online: true, // Placeholder for real-time status
        status: "Active now"
    }));
};

/**
 * Fetches recipes from all chefs followed by a specific user.
 */
export const getRecipesFromFollowedChefsModel = async (followerId) => {
    // First, get the list of chef IDs the user follows
    const { data: followed, error: followError } = await supabase
        .from('followed_chefs')
        .select('chef_id')
        .eq('follower_id', followerId);

    if (followError || !followed || followed.length === 0) return [];

    const chefIds = followed.map(f => f.chef_id);

    // Then, get recipes from these chefs
    const { data, error } = await supabase
        .from('recipes')
        .select(`
            *,
            sellers (full_name)
        `)
        .in('chef_id', chefIds)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(recipe => ({
        ...recipe,
        chef_name: recipe.sellers?.full_name || 'Chef'
    }));
};
