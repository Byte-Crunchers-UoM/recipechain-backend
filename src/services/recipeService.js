import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  getFilteredRecipesModel,
  searchRecipesModel,
  getRecipeWithSellerModel,
  savePaymentRecordModel,
  saveRecipePurchaseModel,
  getSellerWalletModel,
  getUserPurchasesModel // 🛠️ Brought all imports to one place
} from "../models/recipesModel.js";
import xrpl from "xrpl";

class RecipeService {

  // 🛠️ 1. Helper Function to attach the Purchased Badge
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

  // 🛠️ 2. Get All Recipes (Uses the Helper)
  async getAllRecipes(userId = null) {
      const recipes = await getAllRecipesModel();
      return await this._attachPurchaseFlags(recipes, userId);
  }

  // 🛠️ 3. Filter Recipes (Uses the Helper)
  async getFilteredrecipes(filters, userId = null){
    const recipes = await getFilteredRecipesModel(filters);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  // 🛠️ 4. Search Recipes (Uses the Helper)
  async searchRecipes(searchTerm, userId = null) {
    const recipes = await searchRecipesModel(searchTerm);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  // --- CRUD Operations ---
  async addRecipe(recipeData) {
    return await addRecipeModel(recipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  async updateRecipe(id, updateData) {
    return await updateRecipeModel(id, updateData);
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }

  // --- Payment & Unlock Logic ---
  async processRecipeUnlock(buyerId, recipeId, transactionHash) {
      // 1. Get Recipe details
      const recipe = await getRecipeWithSellerModel(recipeId);
      if (!recipe) throw new Error("Recipe not found in Database");

      const priceXrp = recipe.price || recipe.priceXrp || 0; 
      const sellerId = recipe.sellers?.user_id;

      // 2. Verify XRPL Transaction
      const networkUrl = process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";
      const platformAddress = process.env.XRPL_TREASURY_ADDRESS || "rMCnGCWskZYWMd5Vr6SeCmPF1kgg2jX2tX"; 
      
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

          if (received + 0.0001 < expected) {
              throw new Error(`Insufficient payment amount. Expected ${expected} XRP, but received ${received} XRP.`);
          }
      } finally {
          await client.disconnect();
      }

      // 3. Calculate Split
      const sellerShare = Number((priceXrp * 0.90).toFixed(6)); 
      const commissionShare = Number((priceXrp * 0.10).toFixed(6));

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
          
          // ⛔ REFUND LOGIC
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
          
          // ✅ NORMAL PAYOUT LOGIC
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