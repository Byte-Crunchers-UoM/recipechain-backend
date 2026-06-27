// src/services/walletService.js

import { supabase, supabaseAdmin } from "../config/supabase.js";
import xrplService from "./xrplService.js";
import xrpRateService from "./xrpRateService.js";
import activityService from "./activityService.js";

const db = supabaseAdmin || supabase;

const PLATFORM_COMMISSION_RATE = Number(
  process.env.PLATFORM_COMMISSION_RATE || 0.1
);

const AUTO_FUND_XRPL_ON_TOPUP =
  String(process.env.AUTO_FUND_XRPL_ON_TOPUP || "true").toLowerCase() ===
  "true";

const toAmount = (value) => {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  return Number(n.toFixed(6));
};

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getDateValue = (tx) => {
  return tx?.created_at || tx?.time_stamp || tx?.date || tx?.updated_at || "";
};

const sortTransactionsDesc = (a, b) => {
  const aTime = new Date(getDateValue(a)).getTime();
  const bTime = new Date(getDateValue(b)).getTime();

  const safeATime = Number.isFinite(aTime) ? aTime : 0;
  const safeBTime = Number.isFinite(bTime) ? bTime : 0;

  return safeBTime - safeATime;
};

const requireBuyer = async (userId) => {
  const { data, error } = await db
    .from("buyers")
    .select("user_id, account_balance, total_purchases, total_spent_xrp")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("requireBuyer failed:", error);
    throw new Error("Buyer account not found");
  }

  return data;
};

const getUserWallet = async (userId) => {
  const { data, error } = await db
    .from("users")
    .select("user_id, email, wallet_address, role")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("getUserWallet failed:", error);
    throw new Error("User not found");
  }

  return data;
};

const createWalletTransaction = async ({
  userId,
  type,
  direction,
  amount,
  status = "completed",
  description = "",
  txHash = null,
  referenceTable = null,
  referenceId = null,
}) => {
  const normalizedAmount = toAmount(amount);

  const { data, error } = await db
    .from("wallet_transactions")
    .insert([
      {
        user_id: userId,
        type,
        direction,
        amount: normalizedAmount,
        currency: "XRP",
        status,
        description,
        tx_hash: txHash,
        reference_table: referenceTable,
        reference_id: referenceId,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("createWalletTransaction failed:", error);
    throw error;
  }

  return data;
};

const getRecipeTitlesMap = async (recipeIds = []) => {
  const ids = [...new Set(recipeIds.filter(Boolean))];

  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await db
    .from("recipes")
    .select("recipe_id, title")
    .in("recipe_id", ids);

  if (error) {
    console.error("getRecipeTitlesMap failed:", error);
    return new Map();
  }

  return new Map((data || []).map((recipe) => [recipe.recipe_id, recipe.title]));
};

/**
 * Fallback purchase transactions from payments.
 * IMPORTANT:
 * Do not select payments.created_at because your payments table does not have it.
 */
const getPurchaseFallbackTransactions = async (userId) => {
  const { data: payments, error } = await db
    .from("payments")
    .select(
      "payment_id, buyer_id, recipe_id, amount, status, payment_type, payment_hash, time_stamp, updated_at"
    )
    .eq("buyer_id", userId)
    .eq("payment_type", "recipe_purchase")
    .eq("status", "completed")
    .order("time_stamp", { ascending: false });

  if (error) {
    console.error("getPurchaseFallbackTransactions failed:", error);
    return [];
  }

  const safePayments = payments || [];

  if (safePayments.length === 0) {
    return [];
  }

  const recipeTitleMap = await getRecipeTitlesMap(
    safePayments.map((payment) => payment.recipe_id)
  );

  return safePayments.map((payment) => {
    const title = recipeTitleMap.get(payment.recipe_id) || "Recipe";

    return {
      transaction_id: `payment-${payment.payment_id}`,
      user_id: userId,
      type: "purchase",
      direction: "debit",
      amount: safeNumber(payment.amount),
      currency: "XRP",
      status: "completed",
      description: `Purchased recipe: ${title}`,
      tx_hash: payment.payment_hash || null,
      reference_table: "payments",
      reference_id: payment.payment_id,
      created_at: payment.time_stamp || payment.updated_at || "",
      updated_at: payment.updated_at || payment.time_stamp || "",
      source: "payments_fallback",
    };
  });
};

const mergeWalletTransactionsWithPurchaseFallbacks = async ({
  userId,
  walletTransactions = [],
  limit = null,
}) => {
  const fallbackPurchases = await getPurchaseFallbackTransactions(userId);

  const existingKeys = new Set();

  for (const tx of walletTransactions || []) {
    const referenceKey =
      tx.reference_table && tx.reference_id
        ? `${tx.reference_table}:${tx.reference_id}`
        : "";

    const hashKey = tx.tx_hash ? `hash:${tx.tx_hash}` : "";

    if (referenceKey) existingKeys.add(referenceKey);
    if (hashKey) existingKeys.add(hashKey);
  }

  const missingPurchaseFallbacks = fallbackPurchases.filter((paymentTx) => {
    const referenceKey =
      paymentTx.reference_table && paymentTx.reference_id
        ? `${paymentTx.reference_table}:${paymentTx.reference_id}`
        : "";

    const hashKey = paymentTx.tx_hash ? `hash:${paymentTx.tx_hash}` : "";

    return !existingKeys.has(referenceKey) && !existingKeys.has(hashKey);
  });

  const merged = [...(walletTransactions || []), ...missingPurchaseFallbacks]
    .filter(Boolean)
    .sort(sortTransactionsDesc);

  if (typeof limit === "number" && limit > 0) {
    return merged.slice(0, limit);
  }

  return merged;
};

const getWalletOverview = async (userId) => {
  const buyer = await requireBuyer(userId);
  const user = await getUserWallet(userId);

  const { data: baseTransactions, error: txError } = await db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (txError) throw txError;

  const recentTransactions = await mergeWalletTransactionsWithPurchaseFallbacks({
    userId,
    walletTransactions: baseTransactions || [],
    limit: 20,
  });

  let xrplBalance = null;

  if (user.wallet_address) {
    try {
      xrplBalance = await xrplService.getXrpBalance(user.wallet_address);
    } catch (balanceError) {
      console.error("Failed to load XRPL balance:", balanceError);
      xrplBalance = {
        walletAddress: user.wallet_address,
        balanceXrp: null,
        balanceDrops: null,
        network: process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233",
        status: "error",
        error: balanceError.message || "Failed to load XRPL balance",
      };
    }
  } else {
    xrplBalance = {
      walletAddress: "",
      balanceXrp: null,
      balanceDrops: null,
      network: process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233",
      status: "missing_wallet",
      error: "Wallet address not connected",
    };
  }

  return {
    wallet_address: user.wallet_address || "",
    email: user.email || "",
    account_balance: Number(buyer.account_balance || 0),
    recipechain_balance: Number(buyer.account_balance || 0),
    xrpl_testnet_balance:
      xrplBalance?.balanceXrp === null || xrplBalance?.balanceXrp === undefined
        ? null
        : Number(xrplBalance.balanceXrp),
    xrpl_balance_status: xrplBalance?.status || "unknown",
    xrpl_balance_error: xrplBalance?.error || "",
    xrpl_network:
      xrplBalance?.network ||
      process.env.XRPL_NETWORK ||
      "wss://s.altnet.rippletest.net:51233",
    recent_transactions: recentTransactions,
  };
};

const getWalletTransactions = async (userId, options = {}) => {
  const { limit = null } = options;

  let query = db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (typeof limit === "number" && limit > 0) {
    query = query.limit(Math.max(limit, 50));
  }

  const { data, error } = await query;

  if (error) throw error;

  return await mergeWalletTransactionsWithPurchaseFallbacks({
    userId,
    walletTransactions: data || [],
    limit,
  });
};

const createTopupOrder = async ({
  userId,
  amount,
  method = "demo_card",
  externalReference = null,
  txHash = null,
  note = null,
  completed = true,
}) => {
  const normalizedAmount = toAmount(amount);

  const { data, error } = await db
    .from("topup_orders")
    .insert([
      {
        user_id: userId,
        amount_requested: normalizedAmount,
        amount_credited: normalizedAmount,
        currency: "XRP",
        method,
        status: completed ? "completed" : "pending",
        external_reference: externalReference,
        tx_hash: txHash,
        note,
        completed_at: completed ? new Date().toISOString() : null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("createTopupOrder failed:", error);
    throw error;
  }

  return data;
};

const applySuccessfulTopup = async ({
  userId,
  amount,
  amountXrp,
  usdAmount,
  xrpUsdRate,
  method = "demo_card",
  externalReference = null,
  txHash = null,
  note = "Top-up completed",
}) => {
  const normalizedAmount = toAmount(amountXrp ?? amount);

  const buyer = await requireBuyer(userId);
  const user = await getUserWallet(userId);

  if (externalReference) {
    const { data: existingTopup, error: existingTopupError } = await db
      .from("topup_orders")
      .select("topup_id, amount_credited, status, tx_hash")
      .eq("user_id", userId)
      .eq("external_reference", externalReference)
      .maybeSingle();

    if (existingTopupError) throw existingTopupError;

    if (existingTopup) {
      const latestBuyer = await requireBuyer(userId);

      return {
        alreadyProcessed: true,
        topup: existingTopup,
        newBalance: Number(latestBuyer.account_balance || 0),
        txHash: existingTopup.tx_hash || null,
      };
    }
  }

  const currentBalance = Number(buyer.account_balance || 0);
  const newBalance = Number((currentBalance + normalizedAmount).toFixed(6));

  const { data: updatedBuyer, error: buyerUpdateError } = await db
    .from("buyers")
    .update({ account_balance: newBalance })
    .eq("user_id", userId)
    .select("account_balance")
    .single();

  if (buyerUpdateError) {
    console.error("Buyer balance update failed:", buyerUpdateError);
    throw buyerUpdateError;
  }

  let xrplFundingHash = txHash || null;
  let xrplFundingError = null;

  if (AUTO_FUND_XRPL_ON_TOPUP && user.wallet_address) {
    try {
      const fundingResult = await xrplService.sendXrpFromTreasury({
        destination: user.wallet_address,
        amountXrp: normalizedAmount,
      });

      xrplFundingHash = fundingResult?.hash || fundingResult?.txHash || null;
    } catch (fundingError) {
      xrplFundingError = fundingError.message || "XRPL funding failed";
      console.error("XRPL top-up funding failed:", fundingError);
    }
  }

  const topup = await createTopupOrder({
    userId,
    amount: normalizedAmount,
    method,
    externalReference,
    txHash: xrplFundingHash,
    note:
      note ||
      (usdAmount
        ? `Stripe top-up: USD ${Number(usdAmount).toFixed(2)} → ${normalizedAmount} XRP`
        : "Top-up completed"),
    completed: true,
  });

  const usdText =
    usdAmount !== null && usdAmount !== undefined
      ? `USD ${Number(usdAmount).toFixed(2)} → `
      : "";

  await createWalletTransaction({
    userId,
    type: "topup",
    direction: "credit",
    amount: normalizedAmount,
    status: "completed",
    description: `Card top-up completed: ${usdText}${normalizedAmount.toFixed(
      6
    )} XRP`,
    txHash: xrplFundingHash,
    referenceTable: "topup_orders",
    referenceId: topup.topup_id,
  });

  try {
    await activityService.logActivity({
      userId,
      type: "topup",
      title: "Wallet Top Up",
      description: `Wallet topped up by ${normalizedAmount.toFixed(2)} XRP`,
      amountXrp: normalizedAmount,
      status: "completed",
      referenceTable: "topup_orders",
      referenceId: topup.topup_id,
      metadata: {
        external_reference: externalReference,
        tx_hash: xrplFundingHash,
        usd_amount: usdAmount ?? null,
        xrp_usd_rate: xrpUsdRate ?? null,
        xrpl_funding_error: xrplFundingError,
      },
    });
  } catch (activityError) {
    console.error("Top-up activity log failed:", activityError);
  }

  return {
    topup,
    newBalance: Number(updatedBuyer.account_balance || newBalance),
    txHash: xrplFundingHash,
    xrplFundingError,
  };
};

const getRecipeForPurchase = async (recipeId) => {
  const { data, error } = await db
    .from("recipes")
    .select("recipe_id, title, price, chef_id, status")
    .eq("recipe_id", recipeId)
    .single();

  if (error || !data) {
    throw new Error("Recipe not found");
  }

  return data;
};

const ensurePurchaseLedgerEntry = async ({
  userId,
  paymentId,
  recipeId,
  recipeTitle = "Recipe",
  amount,
  txHash = null,
}) => {
  if (!userId || !paymentId) {
    return null;
  }

  const normalizedAmount = toAmount(amount);

  const { data: existingByReference, error: existingByReferenceError } = await db
    .from("wallet_transactions")
    .select("transaction_id")
    .eq("user_id", userId)
    .eq("reference_table", "payments")
    .eq("reference_id", paymentId)
    .maybeSingle();

  if (existingByReferenceError) {
    console.error("Purchase ledger reference check failed:", existingByReferenceError);
  }

  if (!existingByReference && txHash) {
    const { data: existingByHash, error: existingByHashError } = await db
      .from("wallet_transactions")
      .select("transaction_id")
      .eq("user_id", userId)
      .eq("tx_hash", txHash)
      .maybeSingle();

    if (existingByHashError) {
      console.error("Purchase ledger hash check failed:", existingByHashError);
    }

    if (existingByHash) {
      return existingByHash;
    }
  }

  if (existingByReference) {
    return existingByReference;
  }

  const walletTransaction = await createWalletTransaction({
    userId,
    type: "purchase",
    direction: "debit",
    amount: normalizedAmount,
    status: "completed",
    description: `Purchased recipe: ${recipeTitle || "Recipe"}`,
    txHash,
    referenceTable: "payments",
    referenceId: paymentId,
  });

  try {
    const { data: existingActivity, error: existingActivityError } = await db
      .from("user_activities")
      .select("activity_id")
      .eq("user_id", userId)
      .eq("reference_table", "payments")
      .eq("reference_id", paymentId)
      .maybeSingle();

    if (existingActivityError) {
      console.error("Purchase activity duplicate check failed:", existingActivityError);
    }

    if (!existingActivity) {
      await activityService.logActivity({
        userId,
        type: "purchase",
        title: "Recipe Purchase",
        description: `Purchased recipe: ${recipeTitle || "Recipe"}`,
        amountXrp: normalizedAmount,
        status: "completed",
        referenceTable: "payments",
        referenceId: paymentId,
        metadata: {
          recipe_id: recipeId,
          tx_hash: txHash,
        },
      });
    }
  } catch (activityError) {
    console.error("Purchase activity log failed:", activityError);
  }

  return walletTransaction;
};

const buyRecipeWithBalance = async (userId, recipeId) => {
  const buyer = await requireBuyer(userId);
  const recipe = await getRecipeForPurchase(recipeId);

  const price = toAmount(recipe.price);

  const { data: existingPurchase, error: existingPurchaseError } = await db
    .from("recipe_purchases")
    .select("purchase_id")
    .eq("buyer_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existingPurchaseError) throw existingPurchaseError;

  if (existingPurchase) {
    throw new Error("You already purchased this recipe");
  }

  if (Number(buyer.account_balance || 0) < price) {
    throw new Error("Insufficient balance");
  }

  const sellerId = recipe.chef_id;
  const commissionAmount = Number((price * PLATFORM_COMMISSION_RATE).toFixed(6));
  const sellerAmount = Number((price - commissionAmount).toFixed(6));
  const newBalance = Number((Number(buyer.account_balance || 0) - price).toFixed(6));

  const { error: updateBuyerError } = await db
    .from("buyers")
    .update({
      account_balance: newBalance,
      total_purchases: Number(buyer.total_purchases || 0) + 1,
      total_spent_xrp: Number(
        (Number(buyer.total_spent_xrp || 0) + price).toFixed(6)
      ),
    })
    .eq("user_id", userId);

  if (updateBuyerError) throw updateBuyerError;

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .insert([
      {
        buyer_id: userId,
        seller_id: sellerId,
        recipe_id: recipeId,
        amount: price,
        commission_amount: commissionAmount,
        seller_amount: sellerAmount,
        status: "completed",
        payment_type: "recipe_purchase",
      },
    ])
    .select()
    .single();

  if (paymentError) throw paymentError;

  if (sellerId) {
    const { data: seller } = await db
      .from("sellers")
      .select("user_id, account_balance, total_sales, earnings_xrp")
      .eq("user_id", sellerId)
      .maybeSingle();

    if (seller) {
      await db
        .from("sellers")
        .update({
          account_balance: Number(
            (Number(seller.account_balance || 0) + sellerAmount).toFixed(6)
          ),
          total_sales: Number(seller.total_sales || 0) + 1,
          earnings_xrp: Number(
            (Number(seller.earnings_xrp || 0) + sellerAmount).toFixed(6)
          ),
        })
        .eq("user_id", sellerId);
    }
  }

  const { error: createRecipePurchaseError } = await db
    .from("recipe_purchases")
    .insert([
      {
        buyer_id: userId,
        recipe_id: recipeId,
        payment_id: payment.payment_id,
      },
    ]);

  if (createRecipePurchaseError) throw createRecipePurchaseError;

  await ensurePurchaseLedgerEntry({
    userId,
    paymentId: payment.payment_id,
    recipeId,
    recipeTitle: recipe.title,
    amount: price,
    txHash: payment.payment_hash || null,
  });

  return {
    payment,
    newBalance,
    commissionAmount,
    sellerAmount,
  };
};

const requestWithdrawal = async (userId, body) => {
  const amount = toAmount(body.amount);
  const destinationWallet = String(body.destinationWallet || "").trim();

  if (!destinationWallet) {
    throw new Error("Destination wallet is required");
  }

  const buyer = await requireBuyer(userId);

  if (Number(buyer.account_balance || 0) < amount) {
    throw new Error("Insufficient balance");
  }

  const { data, error } = await db
    .from("withdrawal_requests")
    .insert([
      {
        user_id: userId,
        amount,
        currency: "XRP",
        destination_wallet: destinationWallet,
        status: "pending",
        note: body.note || null,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  await createWalletTransaction({
    userId,
    type: "withdrawal",
    direction: "debit",
    amount,
    status: "pending",
    description: "Withdrawal request submitted",
    referenceTable: "withdrawal_requests",
    referenceId: data.withdrawal_id,
  });

  return data;
};

const requestRefund = async (userId, body) => {
  const paymentId = String(body.paymentId || "").trim();
  const reason = String(body.reason || "").trim();

  if (!paymentId) {
    throw new Error("Payment ID is required");
  }

  const { data: payment, error } = await db
    .from("payments")
    .select("*")
    .eq("payment_id", paymentId)
    .eq("buyer_id", userId)
    .single();

  if (error || !payment) {
    throw new Error("Payment not found");
  }

  const { data, error: insertError } = await db
    .from("refund_requests")
    .insert([
      {
        payment_id: paymentId,
        buyer_id: userId,
        amount: Number(payment.amount || 0),
        reason: reason || null,
        status: "pending",
      },
    ])
    .select()
    .single();

  if (insertError) throw insertError;

  await createWalletTransaction({
    userId,
    type: "refund",
    direction: "credit",
    amount: Number(payment.amount || 0),
    status: "pending",
    description: "Refund request submitted",
    referenceTable: "refund_requests",
    referenceId: data.refund_id,
  });

  return data;
};

export default {
  getWalletOverview,
  getWalletTransactions,
  createTopupOrder,
  applySuccessfulTopup,
  buyRecipeWithBalance,
  requestWithdrawal,
  requestRefund,
  ensurePurchaseLedgerEntry,
  getXrpUsdRate: xrpRateService.getXrpUsdRate,
  convertUsdToXrp: xrpRateService.convertUsdToXrp,
  convertXrpToUsd: xrpRateService.convertXrpToUsd,
};
