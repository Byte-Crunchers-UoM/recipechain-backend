import { getRecipeByIdModel } from "../models/recipesModel.js";
import xrplService from "../services/xrplService.js";
import { processRecipeSplitPayment } from "../services/paymentService.js"; // අපි කලින් හදපු 90% යවන service එක
import { supabase } from "../config/supabase.js";

/**
 * Handles recipe unlocking via crypto payments.
 * Validates an XRPL transaction hash, ensures no double-spending,
 * triggers the payout split to the seller, and records the purchase
 * so the buyer gets permanent access.
 */
export const unlockRecipeController = async (req, res) => {
  try {
    const { recipeId, transactionHash } = req.body;
    
    const buyerId = req.user.user_id; 

    if (!recipeId || !transactionHash) {
      return res.status(400).json({ message: "Recipe ID and Transaction Hash are required." });
    }

    // 1. Check if recipe exists and get its price
    const recipe = await getRecipeByIdModel(recipeId);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const expectedAmount = recipe.priceXrp || recipe.price;

    // 2. VERIFY THE TRANSACTION ON THE BLOCKCHAIN
    const verification = await xrplService.verifyPaymentTransaction(transactionHash, expectedAmount);
    
    if (!verification.isValid) {
      return res.status(400).json({ 
        message: "Payment verification failed.", 
        reason: verification.reason 
      });
    }

    // 3. PREVENT DOUBLE-SPENDING (Check if hash is already used)
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('transaction_hash', transactionHash)
      .single();

    if (existingPayment) {
      return res.status(400).json({ message: "This transaction has already been used." });
    }

    // 4. PROCESS THE 90% SPLIT TO THE SELLER
    await processRecipeSplitPayment(recipeId);

    // 5. UPDATE DATABASE TO UNLOCK THE RECIPE FOR THE BUYER
    const { error: insertError } = await supabase
      .from('payments')
      .insert([{
        buyer_id: buyerId,
        recipe_id: recipeId,
        amount_xrp: expectedAmount,
        transaction_hash: transactionHash,
        status: 'completed'
      }]);

    if (insertError) throw insertError;

    // Success response to Frontend
    return res.status(200).json({ 
      success: true, 
      message: "Recipe unlocked successfully!" 
    });

  } catch (error) {
    console.error("Unlock Recipe Error:", error);
    return res.status(500).json({ message: "Internal server error during unlocking process." });
  }
};