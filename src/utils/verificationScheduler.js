const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Scheduled Task: Runs every day at 00:00 (Midnight)
 * Logic: Checks 'sellers' table for users meeting verification criteria
 */
cron.schedule('0 0 * * *', async () => {
    console.log('--- Starting Daily Chef Verification Process ---');

    // Fetch sellers who meet the criteria but are not yet verified
    const { data: eligibleChefs, error } = await supabase
        .from('sellers')
        .select('user_id, total_recipes, avg_rating, followers_count')
        .eq('verify_badge_status', 'not_verified')
        .gte('total_recipes', 50)
        .gte('avg_rating', 4.5)
        .gte('followers_count', 100);

    if (error) {
        console.error('Error fetching eligible chefs:', error.message);
        return;
    }

    if (eligibleChefs && eligibleChefs.length > 0) {
        // Map eligible chefs to the update format
        const updates = eligibleChefs.map(chef => ({
            user_id: chef.user_id,
            verify_badge_status: 'verified',
            verified_at: new Date().toISOString()
        }));

        // Perform bulk update using upsert
        const { error: updateError } = await supabase
            .from('sellers')
            .upsert(updates, { onConflict: 'user_id' });

        if (updateError) {
            console.error('Error updating verification status:', updateError.message);
        } else {
            console.log(`Successfully verified ${eligibleChefs.length} new chefs!`);
        }
    } else {
        console.log('No new chefs met the verification criteria today.');
    }
});