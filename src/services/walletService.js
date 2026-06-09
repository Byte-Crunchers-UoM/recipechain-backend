import { supabase, supabaseAdmin } from "../config/supabase.js";
import xrplService from "./xrplService.js";
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
  const { data, error } = await db
    .from("wallet_transactions")
    .insert([
      {
        user_id: userId,
        type,
        direction,
        amount,
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

const getWalletOverview = async (userId) => {
  const buyer = await requireBuyer(userId);
  const user = await getUserWallet(userId);

  const { data: recentTransactions, error: txError } = await db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (txError) throw txError;

  return {
    wallet_address: user.wallet_address || "",
    email: user.email || "",
    account_balance: Number(buyer.account_balance || 0),
    recent_transactions: recentTransactions || [],
  };
};

const getWalletTransactions = async (userId) => {
  const { data, error } = await db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
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
  method = "demo_card",
  externalReference = null,
  note = "Top-up completed",
}) => {
  const normalizedAmount = toAmount(amount);

  console.log("applySuccessfulTopup started:", {
    userId,
    amount: normalizedAmount,
    method,
    externalReference,
  });

  const buyer = await requireBuyer(userId);
  const user = await getUserWallet(userId);

  console.log("Current buyer balance:", {
    userId,
    currentBalance: Number(buyer.account_balance || 0),
    walletAddress: user.wallet_address || null,
  });

  if (externalReference) {
    const { data: existingTopup, error: existingTopupError } = await db
      .from("topup_orders")
      .select("topup_id, amount_credited, status, tx_hash")
      .eq("user_id", userId)
      .eq("external_reference", externalReference)
      .maybeSingle();

    if (existingTopupError) {
      console.error("existingTopup lookup failed:", existingTopupError);
      throw existingTopupError;
    }

    if (existingTopup) {
      console.log("Top-up already processed, skipping duplicate:", {
        userId,
        externalReference,
        existingTopup,
      });

      return {
        topupOrder: existingTopup,
        newBalance: Number(buyer.account_balance || 0),
        xrplTxHash: existingTopup.tx_hash || null,
        duplicate: true,
      };
    }
  }

  const topupOrder = await createTopupOrder({
    userId,
    amount: normalizedAmount,
    method,
    externalReference,
    note,
    completed: true,
  });

  console.log("Top-up order created:", topupOrder);

  const nextBalance = Number(
    (Number(buyer.account_balance || 0) + normalizedAmount).toFixed(6)
  );

  const { error: updateBuyerError } = await db
    .from("buyers")
    .update({ account_balance: nextBalance })
    .eq("user_id", userId);

  if (updateBuyerError) {
    console.error("Buyer balance update failed:", updateBuyerError);
    throw updateBuyerError;
  }

  console.log("Buyer balance updated:", {
    userId,
    previousBalance: Number(buyer.account_balance || 0),
    addedAmount: normalizedAmount,
    newBalance: nextBalance,
  });

  let xrplTxHash = null;

  if (AUTO_FUND_XRPL_ON_TOPUP && user.wallet_address) {
    try {
      console.log("Sending XRP from treasury to buyer wallet:", {
        destination: user.wallet_address,
        amountXrp: normalizedAmount,
      });

      const xrplResult = await xrplService.sendXrpFromTreasury({
        destination: user.wallet_address,
        amountXrp: normalizedAmount,
      });

      xrplTxHash = xrplResult?.hash || null;

      console.log("XRPL funding success:", {
        userId,
        walletAddress: user.wallet_address,
        xrplTxHash,
      });

      const { error: updateTopupHashError } = await db
        .from("topup_orders")
        .update({ tx_hash: xrplTxHash })
        .eq("topup_id", topupOrder.topup_id);

      if (updateTopupHashError) {
        console.error(
          "Failed to save XRPL tx hash to topup_orders:",
          updateTopupHashError
        );
      }
    } catch (error) {
      console.error("XRPL treasury funding failed:", error);
    }
  } else {
    console.log("XRPL funding skipped:", {
      AUTO_FUND_XRPL_ON_TOPUP,
      hasWalletAddress: Boolean(user.wallet_address),
    });
  }

  const walletTx = await createWalletTransaction({
    userId,
    type: "topup",
    direction: "credit",
    amount: normalizedAmount,
    status: "completed",
    description:
      method === "demo_card"
        ? "Card top-up completed"
        : "Wallet top-up completed",
    txHash: xrplTxHash,
    referenceTable: "topup_orders",
    referenceId: topupOrder.topup_id,
  });

  console.log("Wallet transaction created:", walletTx);

  return {
    topupOrder: {
      ...topupOrder,
      tx_hash: xrplTxHash,
    },
    newBalance: nextBalance,
    xrplTxHash,
    duplicate: false,
  };
};

const getRecipeForPurchase = async (recipeId) => {
  const { data, error } = await db
    .from("recipes")
    .select("recipe_id, chef_id, title, price, status")
    .eq("recipe_id", recipeId)
    .single();

  if (error || !data) {
    throw new Error("Recipe not found");
  }

  return data;
};

const buyRecipeWithBalance = async (userId, recipeId) => {
  const buyer = await requireBuyer(userId);
  const recipe = await getRecipeForPurchase(recipeId);

  if (!recipe.chef_id) {
    throw new Error("Recipe seller not found");
  }

  const price = Number(recipe.price || 0);

  if (price <= 0) {
    throw new Error("Invalid recipe price");
  }

  const currentBalance = Number(buyer.account_balance || 0);

  if (currentBalance < price) {
    throw new Error("Insufficient balance");
  }

  const { data: existingPurchase } = await db
    .from("recipe_purchases")
    .select("purchase_id")
    .eq("buyer_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existingPurchase) {
    throw new Error("Recipe already purchased");
  }

  const commissionAmount = Number((price * PLATFORM_COMMISSION_RATE).toFixed(6));
  const sellerAmount = Number((price - commissionAmount).toFixed(6));
  const newBalance = Number((currentBalance - price).toFixed(6));

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .insert([
      {
        buyer_id: userId,
        seller_id: recipe.chef_id,
        recipe_id: recipeId,
        amount: price,
        payment_hash: null,
        status: "completed",
        payment_type: "recipe_purchase",
        commission_amount: commissionAmount,
        seller_amount: sellerAmount,
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (paymentError) throw paymentError;

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

  const { data: seller, error: sellerError } = await db
    .from("sellers")
    .select("user_id, total_sales, earnings_xrp, account_balance")
    .eq("user_id", recipe.chef_id)
    .single();

  if (sellerError || !seller) {
    throw new Error("Seller not found");
  }

  const nextSellerBalance = Number(
    (Number(seller.account_balance || 0) + sellerAmount).toFixed(6)
  );

  const nextSellerEarnings = Number(
    (Number(seller.earnings_xrp || 0) + sellerAmount).toFixed(6)
  );

  const { error: updateSellerError } = await db
    .from("sellers")
    .update({
      account_balance: nextSellerBalance,
      earnings_xrp: nextSellerEarnings,
      total_sales: Number(seller.total_sales || 0) + 1,
    })
    .eq("user_id", recipe.chef_id);

  if (updateSellerError) throw updateSellerError;

  const { data: chefRecord } = await db
    .from("chef_records")
    .select("record_id, total_earnings")
    .eq("chef_id", recipe.chef_id)
    .maybeSingle();

  let recordId = null;

  if (chefRecord?.record_id) {
    recordId = chefRecord.record_id;

    const { error: updateChefRecordError } = await db
      .from("chef_records")
      .update({
        total_earnings: Number(
          (Number(chefRecord.total_earnings || 0) + sellerAmount).toFixed(6)
        ),
      })
      .eq("record_id", chefRecord.record_id);

    if (updateChefRecordError) throw updateChefRecordError;
  } else {
    const { data: newChefRecord, error: createChefRecordError } = await db
      .from("chef_records")
      .insert([
        {
          chef_id: recipe.chef_id,
          total_earnings: sellerAmount,
          payout: 0,
        },
      ])
      .select()
      .single();

    if (createChefRecordError) throw createChefRecordError;

    recordId = newChefRecord.record_id;
  }

  const { error: createCommissionError } = await db
    .from("commissions")
    .insert([
      {
        payment_id: payment.payment_id,
        record_id: recordId,
        admin_profit: commissionAmount,
        chef_payout: sellerAmount,
      },
    ]);

  if (createCommissionError) throw createCommissionError;

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

  const walletTx = await createWalletTransaction({
    userId,
    type: "purchase",
    direction: "debit",
    amount: price,
    status: "completed",
    description: `Purchased recipe: ${recipe.title || "Recipe"}`,
    referenceTable: "payments",
    referenceId: payment.payment_id,
  });

  await activityService.logActivity({
    userId,
    type: "purchase",
    title: recipe.title || "Recipe Purchase",
    description: `Purchased recipe: ${recipe.title || "Recipe"}`,
    amountXrp: price,
    status: "completed",
    referenceTable: "payments",
    referenceId: payment.payment_id,
    metadata: {
      recipe_id: recipeId,
      seller_id: recipe.chef_id,
      wallet_transaction_id: walletTx?.transaction_id || walletTx?.id || null,
    },
  });

  return {
    payment: {
      ...payment,
      recipe_title: recipe.title,
    },
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
};