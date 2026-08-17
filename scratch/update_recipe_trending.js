import { supabase } from '../src/config/supabase.js';

async function updateTrending() {
    const recipeId = "345081dc-17f2-48c8-b94e-00c56373d78a";
    const chefId = "c99cbd54-2d6a-40a2-b442-c8c8027d4851";
    const purchaseTime = "2026-04-24T15:03:39.936Z";
    const rating = 5;
    const purchaseCount = 1;
    const ratingCount = 1; // Assuming 1 rating of 5

    // Constants from recipeService.js
    const W_BUYS = 10;
    const W_RATINGS = 20;
    const GRAVITY = 1.5;
    const TIME_OFFSET = 2;

    const now = new Date("2026-05-08T07:51:11Z"); // Using current time from metadata
    const createdAt = new Date(purchaseTime);
    const ageInMs = now - createdAt;
    const ageInHours = Math.max(0, ageInMs / (1000 * 60 * 60));

    const numerator = (purchaseCount * W_BUYS) + (ratingAvg * ratingCount * W_RATINGS);
    const denominator = Math.pow(ageInHours + TIME_OFFSET, GRAVITY);
    const heatScore = numerator / denominator;

    console.log(`Age in hours: ${ageInHours}`);
    console.log(`Numerator: ${numerator}`);
    console.log(`Denominator: ${denominator}`);
    console.log(`Calculated Heat Score: ${heatScore}`);

    const trendingData = {
        recipe_id: recipeId,
        chef_id: chefId,
        created_at: purchaseTime,
        rating: rating,
        rating_avg: ratingAvg,
        purchase_count: purchaseCount,
        heat_score: heatScore
    };

    // Delete existing entry if any
    await supabase.from("trending_recipes").delete().eq("recipe_id", recipeId);

    const { data, error } = await supabase
        .from("trending_recipes")
        .insert(trendingData);

    if (error) {
        console.error("Error inserting into trending_recipes:", error);
    } else {
        console.log("Successfully inserted into trending_recipes table.");
    }
}

updateTrending();
