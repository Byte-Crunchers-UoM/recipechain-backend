import { getDashboardStatsService } from '../services/dashboardService.js';
// Make sure to import your supabase client! Adjust the path if your database config is in a different folder.
import { supabase } from '../config/supabase.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. Fetch your existing stats using your service (Your original code)
    const stats = await getDashboardStatsService();

    // 2. Fetch the 5 most recent activities from the database
    const { data: activities, error: activityError } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (activityError) {
      console.error("Error fetching activities:", activityError);
    }

    // 3. Send everything combined to the React frontend
    return res.status(200).json({
      message: "Dashboard stats retrieved successfully",
      data: {
        ...stats, // This spreads out your existing stats (users, recipes, etc.)
        activities: activities || [] // This adds the new activities array
      },
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
};

