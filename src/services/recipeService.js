//src/services/recipeServices.js
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
  getUserPurchasesModel,
  getRecipesByIdsModel,
  getPurchasedRecipeIdsModel,
  getExistingPaymentByHashModel,
  savePaymentItemsModel
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
      const feePercentage = parseFloat(process.env.PLATFORM_COMMISSION_RATE);
      const sellerPercentage = 1 - feePercentage;
      const slippageTolerance = parseFloat(process.env.XRPL_SLIPPAGE_TOLERANCE);
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

  /**
   * Builds the authoritative checkout plan for a set of recipe IDs:
   * which ones are actually payable (not already owned / not the buyer's
   * own recipe) and what the buyer owes in total. This is the single
   * function used by BOTH the pre-payment quote and the post-payment
   * verification, so the two can never disagree.
   */
  async _buildCheckoutPlan(buyerId, recipeIds) {
    const uniqueIds = [...new Set(recipeIds)];
    const recipes = await getRecipesByIdsModel(uniqueIds);

    const foundIds = new Set(recipes.map((r) => r.recipe_id));
    const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Some recipes could not be found: ${missingIds.join(", ")}`);
    }

    const ownedIds = buyerId
      ? new Set(await getPurchasedRecipeIdsModel(buyerId, uniqueIds))
      : new Set();

    const payableItems = [];
    const skippedItems = [];

    for (const recipe of recipes) {
      const isOwner = recipe.chef_id === buyerId || recipe.sellers?.user_id === buyerId;
      const alreadyOwned = ownedIds.has(recipe.recipe_id);

      if (isOwner || alreadyOwned) {
        skippedItems.push({
          recipe_id: recipe.recipe_id,
          title: recipe.title,
          reason: isOwner ? "own_recipe" : "already_purchased",
        });
        continue;
      }

      payableItems.push({
        recipe_id: recipe.recipe_id,
        title: recipe.title,
        seller_id: recipe.sellers?.user_id || recipe.chef_id,
        price: Number(recipe.price) || 0,
      });
    }

    const totalDue = Number(
      payableItems.reduce((sum, item) => sum + item.price, 0).toFixed(6)
    );

    return { payableItems, skippedItems, totalDue };
  }

  /**
   * Pre-payment step: returns a price quote so the UI can show the buyer
   * an accurate total (and which cart items are free/already owned)
   * before they sign anything.
   */
  async getCheckoutQuote(buyerId, recipeIds) {
    return await this._buildCheckoutPlan(buyerId, recipeIds);
  }

  /**
   * Post-payment step: verifies ONE on-chain XRPL transaction covers the
   * full batch total, writes ONE `payments` row for that transaction (your
   * `payment_hash` column is UNIQUE — one row per transaction, not one per
   * recipe), then records the per-recipe breakdown in `payment_items` and
   * grants access via `recipe_purchases`. Idempotent on transactionHash.
   */
  async processBatchRecipeUnlock(buyerId, recipeIds, transactionHash) {
    // Idempotency: a retried request with the same hash returns the
    // original outcome instead of double-processing.
    const existing = await getExistingPaymentByHashModel(transactionHash);
    if (existing) {
      return { alreadyProcessed: true, batch_id: existing.payment_id };
    }

    const { payableItems, skippedItems, totalDue } = await this._buildCheckoutPlan(
      buyerId,
      recipeIds
    );

    if (payableItems.length === 0) {
      throw new Error("Nothing to unlock — all selected recipes are already owned.");
    }

    const networkUrl = process.env.XRPL_NETWORK;
    const platformAddress = process.env.XRPL_TREASURY_ADDRESS;
    if (!networkUrl || !platformAddress) {
      throw new Error(
        "CRITICAL: XRPL network or treasury address is missing from server configuration."
      );
    }

    const feePercentage = parseFloat(process.env.PLATFORM_COMMISSION_RATE);
    const sellerPercentage = 1 - feePercentage;
    const slippageTolerance = parseFloat(process.env.XRPL_SLIPPAGE_TOLERANCE);

    // --- Verify the single on-chain transaction covers the batch total ---
    const client = new xrpl.Client(networkUrl);
    await client.connect();

    try {
      const txResponse = await client.request({ command: "tx", transaction: transactionHash });
      const tx = txResponse.result;

      const actualDestination = tx.Destination || tx.transaction?.Destination || tx.tx_json?.Destination;
      const actualAccount = tx.Account || tx.transaction?.Account || tx.tx_json?.Account;

      let actualAmountDrops =
        tx.meta?.delivered_amount || tx.Amount || tx.transaction?.Amount || tx.tx_json?.Amount;
      if (typeof actualAmountDrops === "object" && actualAmountDrops !== null) {
        actualAmountDrops = actualAmountDrops.value;
      }

      const txMeta = tx.meta || tx.transaction?.meta || tx.tx_json?.meta;
      const txResult = typeof txMeta === "string" ? txMeta : txMeta?.TransactionResult;

      if (txResult !== "tesSUCCESS") throw new Error("Transaction was not successful on the ledger");
      if (actualAccount === platformAddress || actualDestination !== platformAddress) {
        throw new Error("Transaction destination is incorrect.");
      }

      const validDropsString = actualAmountDrops
        ? String(actualAmountDrops).replace(/[^0-9.]/g, "")
        : "0";
      const received = Number(xrpl.dropsToXrp(validDropsString || "0"));

      if (received + slippageTolerance < totalDue) {
        throw new Error(
          `Insufficient payment amount. Expected ${totalDue} XRP for ${payableItems.length} recipe(s), but received ${received} XRP.`
        );
      }
    } finally {
      await client.disconnect();
    }

    // --- Persist: ONE payments row for the whole transaction ---
    const totalCommission = Number((totalDue * feePercentage).toFixed(6));
    const totalSellerAmount = Number((totalDue * sellerPercentage).toFixed(6));

    let paymentRecord;
    try {
      paymentRecord = await savePaymentRecordModel({
        buyer_id: buyerId,
        recipe_id: null, // batch payment covers multiple recipes — see payment_items
        amount: totalDue,
        payment_hash: transactionHash,
        status: "completed",
        seller_id: null, // batch payment may cover multiple sellers — see payment_items
        payment_type: "batch_recipe_purchase",
        commission_amount: totalCommission,
        seller_amount: totalSellerAmount,
      });
    } catch (err) {
      // Raced with another request that processed this exact transaction
      // hash first — fall back to idempotent behavior instead of erroring.
      if (err.code === "23505" || err.message?.includes("duplicate key")) {
        const existingAfterRace = await getExistingPaymentByHashModel(transactionHash);
        return { alreadyProcessed: true, batch_id: existingAfterRace?.payment_id };
      }
      throw err;
    }

    // --- Per-recipe breakdown, all referencing the one payment above ---
    const itemRows = payableItems.map((item) => ({
      payment_id: paymentRecord.payment_id,
      recipe_id: item.recipe_id,
      seller_id: item.seller_id,
      price: item.price,
      commission_amount: Number((item.price * feePercentage).toFixed(6)),
      seller_amount: Number((item.price * sellerPercentage).toFixed(6)),
    }));

    await savePaymentItemsModel(itemRows);

    // --- Grant access per recipe (still one row per recipe — that's correct) ---
    const purchaseResults = [];
    for (const item of itemRows) {
      try {
        await saveRecipePurchaseModel({
          buyer_id: buyerId,
          recipe_id: item.recipe_id,
          payment_id: paymentRecord.payment_id,
        });
        purchaseResults.push({ ...item, status: "granted" });
      } catch (purchaseErr) {
        if (purchaseErr.code === "23505" || purchaseErr.message?.includes("duplicate key")) {
          // Race: this exact recipe got purchased by a concurrent request
          // mid-flight. Don't fail the whole batch — flag it for refund.
          purchaseResults.push({ ...item, status: "duplicate" });
        } else {
          throw purchaseErr;
        }
      }
    }

    // --- Background: pay each seller ONE aggregated payout for the batch ---
    this._payoutBatchSellers(purchaseResults).catch((err) =>
      console.error("❌ Batch payout dispatch failed:", err.message)
    );

    // --- Background: refund the buyer for any items that turned out to
    //     be duplicates (paid for, but ownership already existed) ---
    const duplicateTotal = purchaseResults
      .filter((r) => r.status === "duplicate")
      .reduce((sum, r) => sum + r.price, 0);

    if (duplicateTotal > 0) {
      this._refundBuyer(buyerId, duplicateTotal).catch((err) =>
        console.error("❌ Batch duplicate-refund failed:", err.message)
      );
    }

    return {
      batch_id: paymentRecord.payment_id,
      unlocked: purchaseResults.filter((r) => r.status === "granted").map((r) => r.recipe_id),
      duplicates: purchaseResults.filter((r) => r.status === "duplicate").map((r) => r.recipe_id),
      skipped: skippedItems,
    };
  }

  async _payoutBatchSellers(purchaseResults) {
    const granted = purchaseResults.filter((r) => r.status === "granted" && r.seller_amount > 0);

    const totalsBySeller = new Map();
    for (const r of granted) {
      totalsBySeller.set(r.seller_id, (totalsBySeller.get(r.seller_id) || 0) + r.seller_amount);
    }

    const xrplService = (await import("./xrplService.js")).default;

    for (const [sellerId, amount] of totalsBySeller) {
      if (!sellerId) continue;
      try {
        const sellerUser = await getSellerWalletModel(sellerId);
        const destWallet = sellerUser?.wallet_address;
        if (!destWallet || !destWallet.startsWith("r")) {
          console.error(`❌ Cannot send split payment: Seller ${sellerId} has no valid XRPL wallet.`);
          continue;
        }
        await xrplService.sendXrpFromTreasury({
          destination: destWallet,
          amountXrp: amount.toFixed(6),
        });
        console.log(`✅ Batch payout of ${amount} XRP sent to seller ${destWallet}`);
      } catch (err) {
        console.error(`❌ Batch payout failed for seller ${sellerId}:`, err.message);
      }
    }
  }

  async _refundBuyer(buyerId, amount) {
    const buyerUser = await getSellerWalletModel(buyerId); // generic users lookup, reused
    const buyerWallet = buyerUser?.wallet_address;
    if (!buyerWallet || !buyerWallet.startsWith("r")) {
      console.error(`❌ Cannot refund: Buyer ${buyerId} has no valid XRPL wallet.`);
      return;
    }
    const xrplService = (await import("./xrplService.js")).default;
    await xrplService.sendXrpFromTreasury({ destination: buyerWallet, amountXrp: amount.toFixed(6) });
    console.log(`✅ Refunded ${amount} XRP to buyer for duplicate items in batch.`);
  }
}




export default new RecipeService();