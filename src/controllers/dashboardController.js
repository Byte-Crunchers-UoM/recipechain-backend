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

    // 3. Fetch real monthly revenue + transaction count for the chart
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('commission_amount, time_stamp')
      .eq('status', 'completed')
      .order('time_stamp', { ascending: true });

    let chartData = [];
    if (!paymentsError && payments) {
      // Group by month
      const byMonth = {};
      payments.forEach(p => {
        const d = new Date(p.time_stamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        if (!byMonth[key]) byMonth[key] = { month: label, revenue: 0, transactions: 0 };
        byMonth[key].revenue += parseFloat(p.commission_amount || 0);
        byMonth[key].transactions += 1;
      });
      chartData = Object.values(byMonth).map(entry => ({
        month: entry.month,
        revenue: parseFloat(entry.revenue.toFixed(2)),
        transactions: entry.transactions,
      }));
    }

    // 4. Send everything combined to the React frontend
    return res.status(200).json({
      message: "Dashboard stats retrieved successfully",
      data: {
        ...stats,
        activities: activities || [],
        chartData,
      },
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
};


