import { supabase } from "../config/supabase.js";
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

  async getAllRecipes(userId = null) {
    const recipes = await getAllRecipesModel();
    return await this._attachPurchaseFlags(recipes, userId);
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
    const finalRecipeData = {
      ...recipeData,
      status: recipeData.status || "draft",
      approval_status: recipeData.approval_status || "pending"
    };
    
    return await addRecipeModel(finalRecipeData);
  }

  async getRecipeById(id) {
    return await getRecipeByIdModel(id);
  }

  async updateRecipe(id, recipeData) {
    return await updateRecipeModel(id, recipeData);
  }

  async deleteRecipe(id) {
    return await deleteRecipeModel(id);
  }


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

  async _verifyXrplPayment({
    transactionHash,
    buyerId,
    recipeId,
    expectedAmountXrp,
  }) {
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

  /**
   * Original XRPL payment flow:
   * 1. Buyer sends XRP to platform wallet from frontend.
   * 2. Backend verifies the transaction hash.
   * 3. Backend saves payment and recipe_purchases.
   * 4. Backend sends seller share from treasury.
   *
   * Added improvement:
   * - After access is granted, also log wallet_transactions and user activity.
   * - This does NOT change the original payment logic.
   */
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
}

export default new RecipeService();
