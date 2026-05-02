import { supabase } from '../config/supabase.js'; // Adjust this path if your config file is named differently

export const getDashboardStatsService = async () => {
  try {
    // Count Total Users (head: true makes it lightning fast by only fetching the number)
    const { count: totalUsers, error: userError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Count Total Recipes
    const { count: totalRecipes, error: recipeError } = await supabase
      .from('recipes')
      .select('*', { count: 'exact', head: true });


    // Count Sellers
    const { count: Sellers, error: sellerError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'seller');

       if (userError || recipeError || sellerError) {
      throw new Error("Failed to fetch counts from Supabase");
    }

    //Package the data to send back
    return {
      totalUsers: totalUsers || 0,
      totalRecipes: totalRecipes || 0,
      pendingApprovals: 12,
      Sellers: Sellers || 0,
      totalTransactions: 8934,
      platformRevenue: "284K XRP"
    };

  } catch (error) {
    throw error;
  }
};