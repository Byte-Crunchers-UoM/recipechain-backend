import { supabase } from "../config/supabase.js";

export const getFinanceStats = async (req, res) => {
    try {
        // ==========================
        // Fetch all completed payment items
        // ==========================
        const { data: payments, error: paymentError } = await supabase
            .from("payment_items")
            .select(`
        payment_item_id,
        price,
        commission_amount,
        seller_amount,
        created_at,
        seller_id,

        recipes (
          recipe_id,
          title
        ),

        sellers:seller_id (
          user_id,
          display_name
        ),

        payments!inner (
          payment_id,
          status,
          time_stamp,

          buyers (
            display_name
          )
        )
      `)
            .eq("payments.status", "completed");

        if (paymentError) throw paymentError;

        // ==========================
        // KPI Calculations
        // ==========================

        let totalRevenue = 0;
        let totalCommission = 0;
        const sellerSales = {};

        payments.forEach((tx) => {
            const amount = Number(tx.price || 0);
            const commission = Number(tx.commission_amount || 0);

            totalRevenue += amount;
            totalCommission += commission;

            if (tx.seller_id) {
                if (!sellerSales[tx.seller_id]) {
                    sellerSales[tx.seller_id] = {
                        sellerName: tx.sellers?.display_name || "Unknown Chef",
                        totalSales: 0,
                        earnings: 0,
                    };
                }

                sellerSales[tx.seller_id].totalSales += 1;
                sellerSales[tx.seller_id].earnings += amount - commission;
            }
        });

        const chefEarnings = totalRevenue - totalCommission;

        const topPerformers = Object.values(sellerSales)
            .sort((a, b) => b.earnings - a.earnings)
            .slice(0, 5);

        // ==========================
        // Recent Transactions
        // ==========================

        const recentTransactions = payments
            .sort(
                (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
            )
            .slice(0, 10)
            .map((tx) => ({
                paymentId: tx.payments?.payment_id,
                recipeName: tx.recipes?.title || "N/A",
                buyerName: tx.payments?.buyers?.display_name || "Unknown Buyer",
                sellerName: tx.sellers?.display_name || "Unknown Seller",
                amount: Number(tx.price),
                fee: Number(tx.commission_amount),
                date: tx.payments?.time_stamp,
                status: tx.payments?.status,
            }));

        // ==========================
        // Response
        // ==========================

        return res.status(200).json({
            success: true,
            data: {
                kpis: {
                    totalRevenue,
                    totalCommission,
                    totalTransactions: payments.length,
                },

                chart: {
                    chefEarnings,
                    platformCommission: totalCommission,
                },

                topPerformers,

                recentTransactions,
            },
        });
    } catch (error) {
        console.error("Finance Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};