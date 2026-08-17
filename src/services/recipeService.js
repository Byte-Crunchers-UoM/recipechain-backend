// src/services/recipeService.js
import {
  addRecipeModel,
  getRecipeByIdModel,
  updateRecipeModel,
  deleteRecipeModel,
  getAllRecipesModel,
  upsertTrendingRecipeModel,
  bulkUpsertTrendingRecipesModel,
  getTrendingFromTableModel,
  getAllFeedbacksModel,
  getAllPurchasesModel,
  getChefIdByRecipeIdModel,
  getBuyerCountByRecipeIdModel,
  getRecipesByChefIdModel,
  getAllRecipesForTrendingModel,
  getFilteredRecipesModel,
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
import xrplService from "./xrplService.js";
import walletService from "./walletService.js";

class RecipeService {
  async _attachPurchaseFlags(recipes, userId) {
    if (!recipes || recipes.length === 0) {
      return [];
    }

    if (!userId) {
      return recipes.map((recipe) => ({ ...recipe, is_purchased: false }));
    }

    const purchases = await getUserPurchasesModel(userId);
    const purchasedRecipeIds = (purchases || []).map((p) => p.recipe_id);

    return recipes.map((recipe) => ({
      ...recipe,
      is_purchased:
        purchasedRecipeIds.includes(recipe.recipe_id) || recipe.chef_id === userId,
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

  async getFilteredrecipes(filters, userId = null) {
    const recipes = await getFilteredRecipesModel(filters);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  async searchRecipes(searchTerm, userId = null) {
    const recipes = await searchRecipesModel(searchTerm);
    return await this._attachPurchaseFlags(recipes, userId);
  }

  async addRecipe(recipeData) {
    return await addRecipeModel(recipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  async updateRecipe(id, updateData) {
    // 1. Update the core recipe data
    const updatedRecipe = await updateRecipeModel(id, updateData);

    // 2. Aggregate data from other tables
    const chefId = await getChefIdByRecipeIdModel(id);
    const buyerCount = await getBuyerCountByRecipeIdModel(id);

    // 3. Calculate latest heat score
    const enrichedRecipe = this._calculateRecipeScore({
      ...updatedRecipe,
      buys: buyerCount
    });

    // 4. Sync with trending_recipes table
    // If enrichedRecipe is null (filtered out), we still might want to track basic metrics
    // but the user expects the heat_score to be working.
    const heatScore = enrichedRecipe ? enrichedRecipe.heat_score : 0;

    await upsertTrendingRecipeModel({
      recipe_id: id,
      chef_id: chefId,
      created_at: updatedRecipe.created_at,
      rating_avg: updatedRecipe.average_rating || updatedRecipe.rating || 0,
      purchase_count: buyerCount,
      heat_score: heatScore
    });

    return enrichedRecipe || { ...updatedRecipe, purchase_count: buyerCount, heat_score: 0 };
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }


  _calculateRecipeScore(recipe) {
    if (!recipe) return null;

    // Weights and Constants
    const W_BUYS = 10;
    const W_RATINGS = 20;
    const GRAVITY = 1.5;
    const TIME_OFFSET = 2;

    const now = new Date();

    // Metrics Extraction
    const buysCount = Array.isArray(recipe.buys)
      ? recipe.buys.length
      : (parseInt(recipe.buys) || 0);

    const avgRating = parseFloat(recipe.average_rating) || parseFloat(recipe.rating) || 0;
    const ratingCount = parseInt(recipe.rating_count) || (avgRating > 0 ? 1 : 0);

    // Safety Filter: Exclude score calculation if rating average < 2.0
    // But we still return the metrics
    if (avgRating > 0 && avgRating < 2.0) {
      return {
        ...recipe,
        purchase_count: buysCount,
        heat_score: 0,
      };
    }

    // Time Decay
    const createdAt = recipe.created_at ? new Date(recipe.created_at) : new Date();
    const ageInMs = now - createdAt;
    const ageInHours = Math.max(0, ageInMs / (1000 * 60 * 60));

    // Calculate Score
    // Formula: Score = ((buys * 10) + (Avg Rating * Rating Count * 20)) / (Hours since posted + 2)^1.5
    const numerator = (buysCount * W_BUYS) + (avgRating * ratingCount * W_RATINGS);
    const denominator = Math.pow(ageInHours + TIME_OFFSET, GRAVITY);

    const rawScore = isNaN(numerator / denominator) ? 0 : (numerator / denominator);
    // Asymptotic scale to keep score strictly below 5, plus random noise to satisfy unique constraint
    const score = (4.9 * (1 - Math.exp(-rawScore / 20))) + (Math.random() * 0.09);

    return {
      ...recipe,
      purchase_count: buysCount,
      heat_score: score,
      chef_name: recipe.sellers ? recipe.sellers.full_name : (recipe.chef_name || 'Chef')
    };
  }
  // ==========================================
  // DEV BRANCH: SINGLE RECIPE CHECKOUT HELPERS
  // ==========================================

  _getTransactionResult(txResponse) {
    const meta = txResponse?.result?.meta || txResponse?.result?.metaData;
    if (typeof meta === "string") {
      return meta;
    }
    return meta?.TransactionResult || null;
  }

  _getTransactionObject(txResponse) {
    return txResponse?.result?.tx_json || txResponse?.result || {};
  }

  _readDeliveredAmount(txResponse) {
    const meta = txResponse?.result?.meta || txResponse?.result?.metaData;

    if (!meta || typeof meta === "string") {
      return null;
    }

    const delivered =
      meta.delivered_amount ||
      meta.DeliveredAmount ||
      this._getTransactionObject(txResponse).Amount;

    if (typeof delivered === "string") {
      return Number(xrpl.dropsToXrp(delivered));
    }

    return null;
  }

  async _verifyXrplPayment({ transactionHash, buyerId, recipeId, expectedAmountXrp }) {
    const networkUrl =
      process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";
    const platformWallet =
      process.env.XRPL_TREASURY_ADDRESS ||
      process.env.PLATFORM_XRPL_ADDRESS ||
      process.env.NEXT_PUBLIC_PLATFORM_XRPL_ADDRESS ||
      "";

    if (!platformWallet) {
      throw new Error("Platform XRPL address is not configured");
    }

    const client = new xrpl.Client(networkUrl);

    try {
      await client.connect();

      const txResponse = await client.request({
        command: "tx",
        transaction: transactionHash,
      });

      const tx = this._getTransactionObject(txResponse);
      const txResult = this._getTransactionResult(txResponse);

      if (txResult !== "tesSUCCESS") {
        throw new Error(
          `XRPL transaction was not successful. Status: ${txResult || "Unknown"}`
        );
      }

      if (tx.TransactionType !== "Payment") {
        throw new Error("XRPL transaction type is incorrect");
      }

      if (tx.Destination !== platformWallet) {
        throw new Error("XRPL transaction destination is incorrect");
      }

      const receivedAmount = this._readDeliveredAmount(txResponse);
      const expectedAmount = Number(expectedAmountXrp);

      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        throw new Error("Could not verify received XRP amount");
      }

      if (receivedAmount + 0.000001 < expectedAmount) {
        throw new Error(
          `Insufficient payment amount. Expected ${expectedAmount} XRP, but received ${receivedAmount} XRP.`
        );
      }

      console.log("✅ XRPL transaction verified successfully:", {
        transactionHash,
        buyerId,
        recipeId,
        expectedAmount,
        receivedAmount,
      });

      return {
        tx,
        txResult,
        receivedAmount,
      };
    } finally {
      if (client.isConnected()) {
        await client.disconnect();
      }
    }
  }

  async _payoutSellerInBackground({ sellerId, sellerShare }) {
    if (!sellerId || Number(sellerShare || 0) <= 0) {
      return;
    }

    getSellerWalletModel(sellerId)
      .then((sellerUser) => {
        const destWallet = sellerUser?.wallet_address;

        if (!destWallet || !destWallet.startsWith("r")) {
          console.error(
            `❌ Cannot send split payment: Seller ${sellerId} does not have a valid XRPL wallet address.`
          );
          return;
        }

        return xrplService
          .sendXrpFromTreasury({
            destination: destWallet,
            amountXrp: sellerShare.toString(),
          })
          .then(() => {
            console.log("✅ Revenue split successful for seller:", destWallet);
          });
      })
      .catch((err) => {
        console.error("❌ Split payment failed:", err.message || err);
      });
  }

  async _refundDuplicatePurchaseInBackground({ buyerId, amountXrp }) {
    getSellerWalletModel(buyerId)
      .then((buyerUser) => {
        const buyerWallet = buyerUser?.wallet_address;

        if (!buyerWallet || !buyerWallet.startsWith("r")) {
          console.error(
            `❌ Cannot refund: Buyer ${buyerId} does not have a valid XRPL wallet address.`
          );
          return;
        }

        return xrplService
          .sendXrpFromTreasury({
            destination: buyerWallet,
            amountXrp: amountXrp.toString(),
          })
          .then(() => {
            console.log("✅ Refund successful for buyer:", buyerWallet);
          });
      })
      .catch((err) => {
        console.error("❌ Refund failed:", err.message || err);
      });
  }

  async processRecipeUnlock(buyerId, recipeId, transactionHash) {
    const recipe = await getRecipeWithSellerModel(recipeId);

    if (!recipe) {
      throw new Error("Recipe not found");
    }

    const priceXrp = Number(recipe.price || 0);

    if (!Number.isFinite(priceXrp) || priceXrp <= 0) {
      throw new Error("Invalid recipe price");
    }

    const sellerId = recipe.sellers?.user_id || recipe.chef_id || recipe.seller_id;

    const feePercentage = Number(
      process.env.PLATFORM_COMMISSION_RATE ||
        process.env.PLATFORM_FEE_PERCENTAGE ||
        0.1
    );

    const sellerPercentage = Number((1 - feePercentage).toFixed(6));

    await this._verifyXrplPayment({
      transactionHash,
      buyerId,
      recipeId,
      expectedAmountXrp: priceXrp,
    });

    const sellerShare = Number((priceXrp * sellerPercentage).toFixed(6));
    const commissionShare = Number((priceXrp * feePercentage).toFixed(6));

    const paymentRecord = await savePaymentRecordModel({
      buyer_id: buyerId,
      recipe_id: recipeId,
      amount: priceXrp,
      payment_hash: transactionHash,
      status: "completed",
      seller_id: sellerId,
      payment_type: "recipe_purchase",
      commission_amount: commissionShare,
      seller_amount: sellerShare,
    });

    let isDuplicate = false;

    try {
      await saveRecipePurchaseModel({
        buyer_id: buyerId,
        recipe_id: recipeId,
        payment_id: paymentRecord.payment_id,
      });

      console.log("✅ Recipe access granted to buyer.");
    } catch (purchaseErr) {
      if (
        purchaseErr.code === "23505" ||
        purchaseErr.message?.includes("duplicate key")
      ) {
        console.log("⚠️ Duplicate purchase detected. User already owns this recipe.");
        isDuplicate = true;
      } else {
        throw purchaseErr;
      }
    }

    if (isDuplicate) {
      console.log("🔄 Initiating refund to buyer for duplicate purchase.");
      this._refundDuplicatePurchaseInBackground({
        buyerId,
        amountXrp: priceXrp,
      });

      return {
        success: true,
        duplicate: true,
        paymentId: paymentRecord.payment_id,
      };
    }

    await walletService.ensurePurchaseLedgerEntry({
      userId: buyerId,
      paymentId: paymentRecord.payment_id,
      recipeId,
      recipeTitle: recipe.title || "Recipe",
      amount: priceXrp,
      txHash: transactionHash,
    });

    this._payoutSellerInBackground({
      sellerId,
      sellerShare,
    });

    return {
      success: true,
      duplicate: false,
      paymentId: paymentRecord.payment_id,
      sellerAmount: sellerShare,
      commissionAmount: commissionShare,
    };
  }

  // ==========================================
  // YOUR BRANCH: BATCH RECIPE CHECKOUT
  // ==========================================

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

  async getCheckoutQuote(buyerId, recipeIds) {
    return await this._buildCheckoutPlan(buyerId, recipeIds);
  }

  async processBatchRecipeUnlock(buyerId, recipeIds, transactionHash) {
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
    const platformAddress = process.env.XRPL_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_PLATFORM_XRPL_ADDRESS;
    if (!networkUrl || !platformAddress) {
      throw new Error("CRITICAL: XRPL network or treasury address is missing from server configuration.");
    }

    const feePercentage = parseFloat(process.env.PLATFORM_COMMISSION_RATE || "0.1");
    const sellerPercentage = 1 - feePercentage;
    const slippageTolerance = parseFloat(process.env.XRPL_SLIPPAGE_TOLERANCE || "0.0001");

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

      const validDropsString = actualAmountDrops ? String(actualAmountDrops).replace(/[^0-9.]/g, "") : "0";
      const received = Number(xrpl.dropsToXrp(validDropsString || "0"));

      if (received + slippageTolerance < totalDue) {
        throw new Error(
          `Insufficient payment amount. Expected ${totalDue} XRP, but received ${received} XRP.`
        );
      }
    } finally {
      await client.disconnect();
    }

    const totalCommission = Number((totalDue * feePercentage).toFixed(6));
    const totalSellerAmount = Number((totalDue * sellerPercentage).toFixed(6));

    let paymentRecord;
    try {
      paymentRecord = await savePaymentRecordModel({
        buyer_id: buyerId,
        recipe_id: null,
        amount: totalDue,
        payment_hash: transactionHash,
        status: "completed",
        seller_id: null, 
        payment_type: "batch_recipe_purchase",
        commission_amount: totalCommission,
        seller_amount: totalSellerAmount,
      });
    } catch (err) {
      if (err.code === "23505" || err.message?.includes("duplicate key")) {
        const existingAfterRace = await getExistingPaymentByHashModel(transactionHash);
        return { alreadyProcessed: true, batch_id: existingAfterRace?.payment_id };
      }
      throw err;
    }

    const itemRows = payableItems.map((item) => ({
      payment_id: paymentRecord.payment_id,
      recipe_id: item.recipe_id,
      seller_id: item.seller_id,
      price: item.price,
      commission_amount: Number((item.price * feePercentage).toFixed(6)),
      seller_amount: Number((item.price * sellerPercentage).toFixed(6)),
    }));

    await savePaymentItemsModel(itemRows);

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
          purchaseResults.push({ ...item, status: "duplicate" });
        } else {
          throw purchaseErr;
        }
      }
    }

    this._payoutBatchSellers(purchaseResults).catch((err) =>
      console.error("❌ Batch payout dispatch failed:", err.message)
    );

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
    const buyerUser = await getSellerWalletModel(buyerId); 
    const buyerWallet = buyerUser?.wallet_address;
    if (!buyerWallet || !buyerWallet.startsWith("r")) {
      console.error(`❌ Cannot refund: Buyer ${buyerId} has no valid XRPL wallet.`);
      return;
    }
    await xrplService.sendXrpFromTreasury({ destination: buyerWallet, amountXrp: amount.toFixed(6) });
    console.log(`✅ Refunded ${amount} XRP to buyer for duplicate items in batch.`);
    console.log(`✅ Refunded ${amount} XRP to buyer for duplicate items in batch.`);
  }

  async getTrendingRecipes(limit = 100, category = null) {
    try {
      console.log('--- DEBUG: Starting trending aggregation...');
      
      // 1. Fetch all necessary data in parallel
      const [recipes, feedbacks, purchases] = await Promise.all([
        getAllRecipesForTrendingModel(),
        getAllFeedbacksModel(),
        getAllPurchasesModel()
      ]).catch(err => {
        console.error('--- DEBUG: Error in Promise.all during model fetch:', err.message);
        throw err;
      });

      console.log(`--- DEBUG: Fetched ${recipes.length} recipes, ${feedbacks.length} feedbacks, ${purchases.length} purchases.`);

      // 2. Group feedbacks and purchases by recipe_id for easy lookup
      const feedbacksByRecipe = (feedbacks || []).reduce((acc, fb) => {
        if (fb && fb.recipe_id) {
          if (!acc[fb.recipe_id]) acc[fb.recipe_id] = [];
          acc[fb.recipe_id].push(fb.rating);
        }
        return acc;
      }, {});

      const purchasesByRecipe = (purchases || []).reduce((acc, p) => {
        if (p && p.recipe_id) {
          if (!acc[p.recipe_id]) acc[p.recipe_id] = [];
          acc[p.recipe_id].push(p.unlocked_at);
        }
        return acc;
      }, {});

      // 3. Process and aggregate data for each recipe
      const trendingData = recipes.map(recipe => {
        const recipeId = recipe.recipe_id;
        
        // Calculate Purchase Count
        const purchaseTimes = purchasesByRecipe[recipeId] || [];
        const purchaseCount = purchaseTimes.length;

        // Only proceed if purchase_count >= 1 ---
        if (purchaseCount < 1) return null;

        // Calculate Rating Average
        const ratings = feedbacksByRecipe[recipeId] || [];
        const ratingAvg = ratings.length > 0 
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
          : 0;

        // Get Latest Purchase Timestamp for created_at
        const latestPurchase = new Date(Math.max(...purchaseTimes.map(t => new Date(t))));

        // 4. Calculate Heat Score
        let heatScore = 0;
       
        const scored = this._calculateRecipeScore({
          ...recipe,
          average_rating: ratingAvg,
          rating_count: ratings.length,
          buys: purchaseCount,
          created_at: latestPurchase
        });
        heatScore = scored ? scored.heat_score : 0;

        return {
          recipe_id: recipeId,
          chef_id: recipe.chef_id || null,
          created_at: latestPurchase,
          rating_avg: ratingAvg,
          purchase_count: purchaseCount,
          heat_score: heatScore
        };
      }).filter(item => item !== null && item.heat_score > 0); // Remove recipes with 0 purchases or 0 heat score

      // 5. Bulk Upsert into trending_recipes table
      try {
        const safeNum = (val) => (typeof val === 'number' && !isNaN(val) && isFinite(val)) ? val : 0;

        // Filter to only include columns that exist in the database table
        const dbPayload = trendingData.map(item => ({
          recipe_id: item.recipe_id,
          chef_id: item.chef_id,
          created_at: item.created_at,
          rating_avg: safeNum(item.rating_avg),
          purchase_count: Math.round(safeNum(item.purchase_count)),
          heat_score: safeNum(item.heat_score)
        }));

        await bulkUpsertTrendingRecipesModel(dbPayload);
        console.log(`--- DEBUG: Successfully synced ${dbPayload.length} recipes to trending_recipes table.`);
      } catch (err) {
        console.error('--- DEBUG: Sync to trending_recipes table failed:', err.message);
      }

      // 6. Fetch final sorted data from the table
      try {
        console.log('--- DEBUG: Fetching from trending_recipes table...');
        const tableData = await getTrendingFromTableModel(limit);
        console.log(`--- DEBUG: Successfully fetched ${tableData.length} rows from trending_recipes table.`);
        
        let finalRecipes = tableData.map(row => {
          const recipe = row.recipes;
          if (!recipe) {
            console.warn(`--- DEBUG: No recipe data joined for trending record:`, row.recipe_id);
            return null;
          }
          return {
            ...recipe,
            heat_score: row.heat_score || 0,
            purchase_count: row.purchase_count || 0,
            average_rating: row.rating_avg || 0, // Map to average_rating for frontend
            rating_avg: row.rating_avg || 0,
            created_at: row.created_at,
            chef_name: recipe.sellers ? recipe.sellers.full_name : (recipe.chef_name || 'Chef')
          };
        }).filter(r => r !== null);

        if (category && category.toLowerCase() !== 'all') {
          finalRecipes = finalRecipes.filter(
            (r) => 
              (r.category && r.category.toLowerCase() === category.toLowerCase()) ||
              (r.difficulty_level && r.difficulty_level.toLowerCase() === category.toLowerCase())
          );
        }

        return finalRecipes;

      } catch (err) {
        console.error('--- DEBUG: Fetch from trending_recipes table failed:', err.message);
        throw err; // Re-throw to be caught by the outer catch
      }

    } catch (err) {
      console.error('--- FATAL ERROR in getTrendingRecipes:', err.message);
      throw err;
    }
  }

  async getRecipesByChef(chefId) {
    if (!chefId) {
      throw new Error('Chef ID is required');
    }
    return await getRecipesByChefIdModel(chefId);
  }

}

export default new RecipeService();