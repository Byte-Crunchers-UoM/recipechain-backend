import { getDashboardStatsService } from '../services/dashboardService.js';

export const getDashboardStats = async (req, res) => {
  try {
    const stats = await getDashboardStatsService();

    return res.status(200).json({
      message: "Dashboard stats retrieved successfully",
      data: stats
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
};