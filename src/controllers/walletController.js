import walletService from "../services/walletService.js";
import stripe from "../config/stripe.js";

const getUserId = (req) => req.user?.user_id || req.session?.user_id || null;

export const getMyWalletOverview = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const wallet = await walletService.getWalletOverview(userId);
    return res.status(200).json({ ok: true, wallet });
  } catch (error) {
    console.error("getMyWalletOverview error:", error);
    return res
      .status(400)
      .json({ ok: false, message: error.message || "Failed to load wallet" });
  }
};

export const getMyWalletTransactions = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const transactions = await walletService.getWalletTransactions(userId);
    return res.status(200).json({ ok: true, transactions });
  } catch (error) {
    console.error("getMyWalletTransactions error:", error);
    return res.status(400).json({
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
      return res.status(400).json({ ok: false, message: "Invalid amount" });
    }

    const frontendBaseUrl =
      process.env.FRONTEND_BASE_URL || "http://localhost:3000";

    console.log("Creating Stripe checkout session:", {
      userId,
      amount,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${frontendBaseUrl}/buyer/profile?topup=success`,
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

    console.log("Stripe checkout session created:", {
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
    return res.status(400).json({
      ok: false,
      message: error.message || "Failed to create Stripe Checkout session",
    });
  }
};

export const stripeWebhookHandler = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("Stripe webhook verified:", {
      type: event.type,
      id: event.id,
    });
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error.message
    );
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.client_reference_id || session.metadata?.userId;
      const amountXrp = Number(session.metadata?.amountXrp || 0);

      console.log("checkout.session.completed received:", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        userId,
        amountXrp,
      });

      if (!userId || amountXrp <= 0) {
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

      console.log("Top-up processing result:", result);
    } else {
      console.log("Unhandled Stripe event type:", event.type);
    }

    return res.json({ received: true });
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
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    if (!recipeId) {
      return res
        .status(400)
        .json({ ok: false, message: "Recipe ID is required" });
    }

    const result = await walletService.buyRecipeWithBalance(userId, recipeId);
    return res.status(200).json({
      ok: true,
      message: "Recipe purchased successfully",
      ...result,
    });
  } catch (error) {
    console.error("buyRecipe error:", error);
    return res
      .status(400)
      .json({ ok: false, message: error.message || "Failed to buy recipe" });
  }
};

export const createWithdrawalRequest = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const request = await walletService.requestWithdrawal(userId, req.body || {});
    return res.status(201).json({
      ok: true,
      message: "Withdrawal request created",
      request,
    });
  } catch (error) {
    console.error("createWithdrawalRequest error:", error);
    return res.status(400).json({
      ok: false,
      message: error.message || "Failed to create withdrawal request",
    });
  }
};

export const createRefundRequest = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const request = await walletService.requestRefund(userId, req.body || {});
    return res.status(201).json({
      ok: true,
      message: "Refund request created",
      request,
    });
  } catch (error) {
    console.error("createRefundRequest error:", error);
    return res.status(400).json({
      ok: false,
      message: error.message || "Failed to create refund request",
    });
  }
};