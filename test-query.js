import { supabase } from './src/config/supabase.js';

async function test() {
    try {
        console.log("Testing Supabase Query with payments.status...");
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

        if (paymentError) {
            console.error("Error encountered:", paymentError);
        } else {
            console.log("Success! Data received:", JSON.stringify(payments, null, 2));
        }
    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

test();
