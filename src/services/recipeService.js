// src/services/recipeService.js
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
  getUserPurchasesModel,
  getRecipesByIdsModel,
  getPurchasedRecipeIdsModel,
  getExistingPaymentByHashModel,
  savePaymentItemsModel,
  verifyRecipeModel
} from "../models/recipesModel.js";
import { embedAndStoreRecipe } from "./vectorService.js";
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
    return await updateRecipeModel(id, updateData);
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }
  async verifyRecipe(id, { approval_status, rejection_reason }) {
    return await verifyRecipeModel(id, { approval_status, rejection_reason });
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
  }
}

export default new RecipeService();