import { supabase } from '../config/supabase.js';
export const getFinanceStats = async (req, res) => {
    try {
        // 1. Fetch all successful payments from the payment_items table
        // Adjust 'status' to match whatever your success state is (e.g., 'completed', 'success')
        // Note:
        // 1. We query 'user_id' instead of 'id' on the 'sellers' table because user_id is the primary key link.
        // 2. We perform an inner join ('payments!inner') to filter records by payments status.
        // 3. We filter on 'payments.status' = 'completed' (not 'success') because the status is stored on the parent payments table.
        const { data: payments, error: paymentError } = await supabase
            .from('payment_items')
            .select(`
                *,
                recipes ( title ),
                sellers ( display_name, user_id ),
                payments!inner ( 
                    status,
                    buyers ( display_name ) 
                )
            `)
            .eq('payments.status', 'completed');
        if (paymentError) throw paymentError;

        // 2. Initialize our counters
        let totalRevenue = 0;
        let totalCommission = 0;
        let totalTransactions = payments ? payments.length : 0;
        let sellerSales = {}; // To calculate Top Performers

        // 3. Loop through payments to calculate totals
        if (payments && payments.length > 0) {
            payments.forEach(tx => {
                // Note: We use 'tx.price' because 'payment_items' table uses the column name 'price' instead of 'amount'.
                const amount = Number(tx.price || 0);
                const commission = Number(tx.commission_amount || 0); // Change to match your DB column
                
                totalRevenue += amount;
                totalCommission += commission;

                // Group sales by seller for the Top Performers table
                const sellerId = tx.seller_id;
                if (sellerId) {
                    if (!sellerSales[sellerId]) {
                        sellerSales[sellerId] = {
                            display_name: tx.sellers?.display_name || 'Unknown Chef',
                            total_sales: 0,
                            earnings_xrp: 0
                        };
                    }
                    sellerSales[sellerId].total_sales += 1;
                    sellerSales[sellerId].earnings_xrp += (amount - commission);
                }
            });
        }

        const chefEarnings = totalRevenue - totalCommission;

        // 4. Sort sellers to get the Top 5
        const topPerformers = Object.values(sellerSales)
            .sort((a, b) => b.earnings_xrp - a.earnings_xrp)
            .slice(0, 5);

        // 5. Format and send exactly what the React frontend expects
        return res.status(200).json({
            success: true,
            data: {
                kpis: {
                    totalRevenue,
                    totalCommission,
                    totalTransactions
                },
                chart: {
                    chefEarnings,
                    platformCommission: totalCommission
                },
                topPerformers,
                // Note: The frontend expects 'tx.amount', 'tx.time_stamp', and direct 'tx.buyers' object.
                // Since the database returns 'tx.price', 'tx.created_at', and nested 'tx.payments.buyers',
                // we map them here to match the frontend expectations.
                recentTransactions: payments ? payments.slice(0, 10).map(tx => ({
                    ...tx,
                    amount: tx.price,
                    time_stamp: tx.created_at,
                    buyers: tx.payments?.buyers
                })) : []
            }
        });

    } catch (error) {
        console.error("Finance Dashboard Error:", error);
        return res.status(500).json({ success: false, message: "Failed to load finance data" });
    }
};