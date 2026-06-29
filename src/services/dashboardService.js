import { supabase } from '../config/supabase.js'; 

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

     const { count: pendingSellerCount, error: pendingSellerError } = await supabase
      .from('sellers')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending');

    // Pending recipe approvals
    const { count: pendingRecipeCount, error: pendingRecipeError } = await supabase
      .from('recipes')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'pending');

    if (userError || recipeError || sellerError || pendingSellerError || pendingRecipeError) {
      throw new Error("Failed to fetch counts from Supabase");
    }
    // Count Total Transactions
    const { count: totalTransactions, error: transactionError } = await supabase
    .from('payments')
    .select('*', { count: 'exact', head: true });

    if (userError || recipeError || sellerError || pendingSellerError || pendingRecipeError || transactionError) {
    throw new Error("Failed to fetch counts from Supabase");
  }
  const { data: revenueData, error: revenueError } = await supabase
  .from('payments')
  .select('amount')
  .eq('status', 'completed');

  const platformRevenue = revenueData
  ? revenueData.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
  : 0;

    //Package the data to send back
    return {
      totalUsers: totalUsers || 0,
      totalRecipes: totalRecipes || 0,
      pendingApprovals: (pendingSellerCount || 0) + (pendingRecipeCount || 0),
      Sellers: Sellers || 0,
      totalTransactions: totalTransactions || 0, 
       platformRevenue: `${platformRevenue.toFixed(2)} XRP`
    };

  } catch (error) {
    throw error;
  }
};