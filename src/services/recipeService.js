import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getFilteredRecipesModel,
  verifyRecipeModel,
  searchRecipesModel,
  getRecipeWithSellerModel,
  savePaymentRecordModel,
  saveRecipePurchaseModel,
  getSellerWalletModel,
  getUserPurchasesModel 
} from "../models/recipesModel.js";
import xrpl from "xrpl";

class RecipeService {

  /**
   * Helper Function to attach the 'is_purchased' flag to a list of recipes.
   * Lets the UI know which recipes the user already owns, so they aren't
   * prompted to pay again.
   */
  async _attachPurchaseFlags(recipes, userId) {
      if (!userId || !recipes || recipes.length === 0) {
          return recipes.map(recipe => ({ ...recipe, is_purchased: false }));
      }

      const purchases = await getUserPurchasesModel(userId);
      const purchasedRecipeIds = purchases.map(p => p.recipe_id);

      return recipes.map(recipe => ({
          ...recipe,
          is_purchased: purchasedRecipeIds.includes(recipe.recipe_id) || recipe.chef_id === userId
      }));
  }

  /**
   * Retrieves all recipes and determines if the current user has bought them.
   */
  async getAllRecipes(userId = null, from, to) {
      // Pass the pre-calculated bounds to the model
      const { data, totalCount } = await getAllRecipesModel(from, to);
      
      const recipesWithFlags = await this._attachPurchaseFlags(data, userId);
      
      return {
          recipes: recipesWithFlags,
          totalCount: totalCount
      };
  }

  /**
   * Retrieves recipes based on tags/filters and attaches purchase status.
   */
  async getFilteredrecipes(filters, userId = null){
    const recipes = await getFilteredRecipesModel(filters);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  /**
   * Performs a keyword search on recipes and attaches purchase status.
   */
  async searchRecipes(searchTerm, userId = null) {
    const recipes = await searchRecipesModel(searchTerm);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  /**
   * Saves a new recipe creation to the database.
   */
  async addRecipe(recipeData) {
    return await addRecipeModel(recipeData);
  }

  /**
   * Retrieves a single recipe by its unique ID.
   */
  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  /**
   * Updates the details of an existing recipe in the database.
   */
  async updateRecipe(id, updateData) {
    return await updateRecipeModel(id, updateData);
  }

  /**
   * Deletes a given recipe from the database.
   */
  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }

  async verifyRecipe(id, verificationData) {
    // We pass the logic to the model to handle the Supabase update
    return await verifyRecipeModel(id, verificationData);
  }


  // FIXED: Changed 'r' to 'R' to match standard naming and Controller calls
  async getFilteredRecipes(filters){ 
    return await getFilteredRecipesModel(filters);
  }
  /**
   * Core payment logic for RecipeChain. Connects to the XRPL (XRP Ledger),
   * verifies the user's transaction, records the payment, and automatically
   * splits and sends the XRPL funds based on dynamic environment variables.
   */
  async processRecipeUnlock(buyerId, recipeId, transactionHash) {
      // 1. Get Recipe details
      const recipe = await getRecipeWithSellerModel(recipeId);
      if (!recipe) throw new Error("Recipe not found in Database");

      const priceXrp = recipe.price || recipe.priceXrp || 0; 
      const sellerId = recipe.sellers?.user_id;

      //  BEST PRACTICE: Load config from environment and fail fast if missing
      const networkUrl = process.env.XRPL_NETWORK;
      const platformAddress = process.env.XRPL_TREASURY_ADDRESS;
      
      if (!networkUrl || !platformAddress) {
          throw new Error("CRITICAL: XRPL network or treasury address is missing from server configuration.");
      }

      // Load dynamic business rules (with safe fallbacks for math)
      const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || "0.10");
      const sellerPercentage = 1 - feePercentage;
      const slippageTolerance = parseFloat(process.env.XRPL_SLIPPAGE_TOLERANCE || "0.0001");

      // 2. Verify XRPL Transaction
      let client = new xrpl.Client(networkUrl);
      await client.connect();

      try {
          const txResponse = await client.request({ command: "tx", transaction: transactionHash });
          const tx = txResponse.result;

          const actualDestination = tx.Destination || tx.transaction?.Destination || tx.tx_json?.Destination;
          const actualAccount = tx.Account || tx.transaction?.Account || tx.tx_json?.Account;
          
          let actualAmountDrops = tx.meta?.delivered_amount || tx.Amount || tx.transaction?.Amount || tx.tx_json?.Amount;
          if (typeof actualAmountDrops === 'object' && actualAmountDrops !== null) actualAmountDrops = actualAmountDrops.value; 

          const txMeta = tx.meta || tx.transaction?.meta || tx.tx_json?.meta;
          const txResult = typeof txMeta === 'string' ? txMeta : txMeta?.TransactionResult;

          if (txResult !== 'tesSUCCESS') throw new Error('Transaction was not successful on the ledger');
          if (actualAccount === platformAddress || actualDestination !== platformAddress) throw new Error('Transaction destination is incorrect.');

          let validDropsString = actualAmountDrops ? String(actualAmountDrops).replace(/[^0-9.]/g, '') : "0";
          const droppedAmount = xrpl.dropsToXrp(validDropsString || "0");
          const received = Number(droppedAmount);
          const expected = Number(priceXrp);

          if (received + slippageTolerance < expected) {
              throw new Error(`Insufficient payment amount. Expected ${expected} XRP, but received ${received} XRP.`);
          }
      } finally {
          await client.disconnect();
      }

      // 3. Calculate Split dynamically
      const sellerShare = Number((priceXrp * sellerPercentage).toFixed(6)); 
      const commissionShare = Number((priceXrp * feePercentage).toFixed(6));

      // 4. Save Payment to DB
      const paymentRecord = await savePaymentRecordModel({
          buyer_id: buyerId, 
          recipe_id: recipeId, 
          amount: priceXrp,
          payment_hash: transactionHash,
          status: 'completed', 
          seller_id: sellerId,
          payment_type: 'recipe_purchase',
          commission_amount: commissionShare,
          seller_amount: sellerShare
      });

      // 5. Grant Access (Save to recipe_purchases)
      let isDuplicate = false; 

      try {
          await saveRecipePurchaseModel({
              buyer_id: buyerId,
              recipe_id: recipeId,
              payment_id: paymentRecord.payment_id
          });
          console.log("✅ Recipe access granted to buyer.");
      } catch (purchaseErr) {
          if (purchaseErr.code === '23505' || purchaseErr.message?.includes('duplicate key')) {
              console.log("⚠️ Duplicate purchase detected! User already owns this recipe.");
              isDuplicate = true; 
          } else {
              throw purchaseErr; 
          }
      }

      // 6. Background Process: Refund OR Payout to Seller
      if (isDuplicate) {
          console.log("🔄 Initiating Refund to Buyer for duplicate purchase...");
          
          getSellerWalletModel(buyerId).then(buyerUser => {
              const buyerWallet = buyerUser?.wallet_address;
              
              if (!buyerWallet || !buyerWallet.startsWith('r')) {
                  console.error(`❌ Cannot refund: Buyer ${buyerId} does not have a valid XRPL wallet address.`);
                  return;
              }

              import('./xrplService.js').then(async (xrplService) => {
                  try {
                      console.log(`Refunding ${priceXrp} XRP back to Buyer (${buyerWallet})...`);
                      await xrplService.default.sendXrpFromTreasury({
                          destination: buyerWallet,
                          amountXrp: priceXrp.toString() 
                      });
                      console.log("✅ Refund successful for buyer:", buyerWallet);
                  } catch (err) {
                      console.error("❌ Refund failed:", err.message);
                  }
              });
          }).catch(err => console.error("❌ Failed to get buyer wallet for refund:", err));

      } else if (sellerId && priceXrp > 0) {
          
          getSellerWalletModel(sellerId).then(sellerUser => {
              const destWallet = sellerUser?.wallet_address;
              
              if (!destWallet || !destWallet.startsWith('r')) {
                  console.error(`❌ Cannot send split payment: Seller ${sellerId} does not have a valid XRPL wallet address.`);
                  return; 
              }

              import('./xrplService.js').then(async (xrplService) => {
                  try {
                      console.log(`Sending ${sellerShare} XRP to Seller (${destWallet})...`);
                      await xrplService.default.sendXrpFromTreasury({
                          destination: destWallet,
                          amountXrp: sellerShare.toString()
                      });
                      console.log("✅ Revenue split successful for seller:", destWallet);
                  } catch (err) {
                      console.error("❌ Split payment failed:", err.message);
                  }
              });
              
          }).catch(err => console.error("❌ Failed to get seller wallet:", err));
      }

      return true;
  }
}

export default new RecipeService();