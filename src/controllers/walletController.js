import walletService from "../services/walletService.js";
import stripe from "../config/stripe.js";

const getUserId = (req) => req.user?.user_id || req.session?.user_id || null;

const getErrorStatusCode = (error) => {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("unauthorized")) return 401;
  if (message.includes("insufficient")) return 402;
  if (message.includes("already purchased")) return 409;
  if (message.includes("not found")) return 404;

  return 400;
};

const getFrontendBaseUrl = () => {
  return String(process.env.FRONTEND_BASE_URL || "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
};

const getStripeWebhookSecret = () => {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
};

const toNumberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringValue = (value) => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
};

const logDevelopment = (...args) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
};

const buildPurchaseResponse = ({ result, fallbackRecipeId }) => {
  const payment = result?.payment || null;

  const paymentId =
    toStringValue(payment?.payment_id) ||
    toStringValue(payment?.id) ||
    toStringValue(result?.paymentId);

  const recipeId =
    toStringValue(payment?.recipe_id) ||
    toStringValue(result?.recipeId) ||
    fallbackRecipeId;

  const amount =
    toNumberValue(payment?.amount) ||
    toNumberValue(result?.recipe?.price) ||
    toNumberValue(result?.amount);

  return {
    ok: true,
    message: "Recipe purchased successfully",
    paymentId,
    recipeId,
    payment,
    recipe: {
      id: recipeId,
      price: amount,
      title: payment?.recipe_title || result?.recipe?.title || "",
    },
    newBalance: result?.newBalance,
    commissionAmount: result?.commissionAmount,
    sellerAmount: result?.sellerAmount,
  };
};

export const getMyWalletOverview = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const wallet = await walletService.getWalletOverview(userId);

    return res.status(200).json({
      ok: true,
      wallet,
    });
  } catch (error) {
    console.error("getMyWalletOverview error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to load wallet",
    });
  }
};

export const getMyWalletTransactions = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const transactions = await walletService.getWalletTransactions(userId);

    return res.status(200).json({
      ok: true,
      transactions,
    });
  } catch (error) {
    console.error("getMyWalletTransactions error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to load wallet transactions",
    });
  }
};

export const createStripeTopupCheckoutSession = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Invalid amount",
      });
    }

    const frontendBaseUrl = getFrontendBaseUrl();

    logDevelopment("Creating Stripe checkout session:", {
      userId,
      amount,
      frontendBaseUrl,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${frontendBaseUrl}/buyer/profile?topup=success&amount=${encodeURIComponent(
        String(amount)
      )}`,
      cancel_url: `${frontendBaseUrl}/buyer/profile?topup=cancelled`,
      client_reference_id: userId,
      metadata: {
        userId,
        amountXrp: String(amount),
        topupMethod: "demo_card",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: "RecipeChain Wallet Top-Up",
              description: `${amount.toFixed(
                2
              )} XRP equivalent top-up (test mode)`,
            },
            unit_amount: Math.round(amount * 100),
          },
        },
      ],
    });

    logDevelopment("Stripe checkout session created:", {
      sessionId: session.id,
      url: session.url,
    });

    return res.status(200).json({
      ok: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("createStripeTopupCheckoutSession error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to create Stripe Checkout session",
    });
  }
};

export const stripeWebhookHandler = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("Webhook Error: Missing webhook secret");
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    logDevelopment("Stripe webhook verified:", {
      type: event.type,
      id: event.id,
    });
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type !== "checkout.session.completed") {
      logDevelopment("Unhandled Stripe event type:", event.type);
      return res.json({ received: true, skipped: true });
    }

    const session = event.data.object;

    const userId = session.client_reference_id || session.metadata?.userId;
    const amountXrp = Number(session.metadata?.amountXrp || 0);

    logDevelopment("checkout.session.completed received:", {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      userId,
      amountXrp,
    });

    if (!userId || !Number.isFinite(amountXrp) || amountXrp <= 0) {
      console.warn("Invalid checkout.session.completed payload:", {
        sessionId: session.id,
        userId,
        amountXrp,
      });

      return res.json({ received: true, skipped: true });
    }

    const result = await walletService.applySuccessfulTopup({
      userId,
      amount: amountXrp,
      method: "demo_card",
      externalReference: session.id,
      note: "Stripe Checkout top-up completed",
    });

    logDevelopment("Top-up processing result:", result);

    return res.json({
      received: true,
      processed: true,
    });
  } catch (error) {
    console.error("Stripe webhook handling failed:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Webhook processing failed",
    });
  }
};

export const buyRecipe = async (req, res) => {
  try {
    const userId = getUserId(req);
    const recipeId = String(req.body?.recipeId || "").trim();

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (!recipeId) {
      return res.status(400).json({
        ok: false,
        message: "Recipe ID is required",
      });
    }

    const result = await walletService.buyRecipeWithBalance(userId, recipeId);
    const response = buildPurchaseResponse({
      result,
      fallbackRecipeId: recipeId,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("buyRecipe error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to buy recipe",
    });
  }
};

export const createWithdrawalRequest = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    const request = await walletService.requestWithdrawal(userId, req.body || {});

    return res.status(201).json({
      ok: true,
      message: "Withdrawal request created",
      request,
      withdrawalId: request?.withdrawal_id || request?.id || null,
    });
  } catch (error) {
    console.error("createWithdrawalRequest error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to create withdrawal request",
    });
  }
};

export const createRefundRequest = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    const request = await walletService.requestRefund(userId, req.body || {});

    return res.status(201).json({
      ok: true,
      message: "Refund request created",
      request,
      refundId: request?.refund_id || request?.id || null,
    });
  } catch (error) {
    console.error("createRefundRequest error:", error);

    return res.status(getErrorStatusCode(error)).json({
      ok: false,
      message: error.message || "Failed to create refund request",
    });
  }
};