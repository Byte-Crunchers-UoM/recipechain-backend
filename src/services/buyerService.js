// src/services/buyerService.js

import { supabase, supabaseAdmin } from "../config/supabase.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";
import activityService from "./activityService.js";

const db = supabaseAdmin || supabase;

const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BIO_LENGTH = 500;

const getEmailFallbackName = (email = "") => {
  const prefix = String(email || "").split("@")[0] || "Buyer";

  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const sanitizeDisplayName = (value, fallback) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned) return fallback || "RecipeChain Buyer";

  if (cleaned.length > MAX_DISPLAY_NAME_LENGTH) {
    return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
  }

  return cleaned;
};

const sanitizeBio = (value) => {
  const cleaned = String(value || "").trim();

  if (cleaned.length > MAX_BIO_LENGTH) {
    return cleaned.slice(0, MAX_BIO_LENGTH).trim();
  }

  return cleaned;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampProgress = (current, target) => {
  const safeCurrent = Number(current || 0);
  const safeTarget = Number(target || 0);

  if (!safeTarget || safeTarget <= 0) return 0;

  return Math.min(Math.max(safeCurrent, 0), safeTarget);
};

const buildBadge = ({ key, title, description, current, target }) => {
  const safeCurrent = Number(current || 0);
  const safeTarget = Number(target || 0);

  return {
    key,
    title,
    description,
    earned: safeTarget > 0 ? safeCurrent >= safeTarget : false,
    progress: clampProgress(safeCurrent, safeTarget),
    target: safeTarget,
  };
};

const computeBuyerBadges = ({
  totalPurchases = 0,
  totalSpentXrp = 0,
  savedRecipes = 0,
  feedbackCount = 0,
}) => {
  return [
    buildBadge({
      key: "first_purchase",
      title: "First Taste",
      description: "Completed first recipe purchase",
      current: totalPurchases,
      target: 1,
    }),
    buildBadge({
      key: "top_buyer",
      title: "Top Buyer",
      description: "Purchased 10+ recipes",
      current: totalPurchases,
      target: 10,
    }),
    buildBadge({
      key: "collector",
      title: "Recipe Collector",
      description: "Saved 10+ recipes",
      current: savedRecipes,
      target: 10,
    }),
    buildBadge({
      key: "big_supporter",
      title: "Big Supporter",
      description: "Spent 250+ XRP",
      current: totalSpentXrp,
      target: 250,
    }),
    buildBadge({
      key: "community_voice",
      title: "Community Voice",
      description: "Left 5+ reviews",
      current: feedbackCount,
      target: 5,
    }),
  ];
};

const truncateForActivity = (value, maxLength = 40) => {
  const cleaned = String(value || "").trim();

  if (!cleaned) return "Empty";

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
};

const buildProfileUpdateActivity = ({
  previousDisplayName,
  nextDisplayName,
  previousBio,
  nextBio,
  previousProfilePicture,
  nextProfilePicture,
}) => {
  const changes = [];
  const metadata = {
    display_name_changed: previousDisplayName !== nextDisplayName,
    bio_changed: previousBio !== nextBio,
    profile_picture_changed: previousProfilePicture !== nextProfilePicture,
  };

  if (metadata.display_name_changed) {
    changes.push(
      `Display name updated from "${truncateForActivity(
        previousDisplayName
      )}" to "${truncateForActivity(nextDisplayName)}"`
    );
  }

  if (metadata.bio_changed) {
    changes.push("Introduction updated");
  }

  if (metadata.profile_picture_changed) {
    changes.push("Profile photo updated");
  }

  return {
    hasChanges: changes.length > 0,
    title: "Profile Updated",
    description:
      changes.length > 0 ? changes.join(". ") : "Updated buyer profile details",
    metadata,
  };
};

const sortActivitiesDesc = (a, b) => {
  const aTime = new Date(a.date || a.created_at || "").getTime();
  const bTime = new Date(b.date || b.created_at || "").getTime();

  return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
};

const getPurchasedStatsFromRecipePurchases = async (userId) => {
  const { data: purchaseRows, error: purchaseRowsError } = await db
    .from("recipe_purchases")
    .select("purchase_id, recipe_id, payment_id, unlocked_at")
    .eq("buyer_id", userId);

  if (purchaseRowsError) throw purchaseRowsError;

  const safePurchaseRows = purchaseRows || [];
  const totalPurchases = safePurchaseRows.length;

  if (totalPurchases === 0) {
    return {
      totalPurchases: 0,
      totalSpentXrp: 0,
      purchaseRows: [],
      paymentIds: [],
      recipeIds: [],
      paymentsById: new Map(),
      recipesById: new Map(),
    };
  }

  const paymentIds = [
    ...new Set(
      safePurchaseRows
        .map((row) => row.payment_id)
        .filter((paymentId) => Boolean(paymentId))
    ),
  ];

  const recipeIds = [
    ...new Set(
      safePurchaseRows
        .map((row) => row.recipe_id)
        .filter((recipeId) => Boolean(recipeId))
    ),
  ];

  let paymentsById = new Map();

  if (paymentIds.length > 0) {
    /**
     * IMPORTANT:
     * Do not select payments.created_at because your payments table does not have it.
     */
    const { data: payments, error: paymentsError } = await db
      .from("payments")
      .select("payment_id, amount, status, payment_type, recipe_id, payment_hash, time_stamp, updated_at")
      .in("payment_id", paymentIds);

    if (paymentsError) throw paymentsError;

    paymentsById = new Map(
      (payments || []).map((payment) => [payment.payment_id, payment])
    );
  }

  let recipesById = new Map();

  if (recipeIds.length > 0) {
    const { data: recipes, error: recipesError } = await db
      .from("recipes")
      .select("recipe_id, title, price")
      .in("recipe_id", recipeIds);

    if (recipesError) throw recipesError;

    recipesById = new Map(
      (recipes || []).map((recipe) => [recipe.recipe_id, recipe])
    );
  }

  const totalSpentXrp = safePurchaseRows.reduce((sum, purchase) => {
    const payment = purchase.payment_id
      ? paymentsById.get(purchase.payment_id)
      : null;

    if (
      payment &&
      payment.payment_type === "recipe_purchase" &&
      payment.status === "completed"
    ) {
      return sum + toNumber(payment.amount);
    }

    const recipe = purchase.recipe_id ? recipesById.get(purchase.recipe_id) : null;

    return sum + toNumber(recipe?.price);
  }, 0);

  return {
    totalPurchases,
    totalSpentXrp: Number(totalSpentXrp.toFixed(6)),
    purchaseRows: safePurchaseRows,
    paymentIds,
    recipeIds,
    paymentsById,
    recipesById,
  };
};

const syncBuyerDerivedStats = async ({
  userId,
  totalPurchases,
  totalSpentXrp,
}) => {
  const { error } = await db
    .from("buyers")
    .update({
      total_purchases: totalPurchases,
      total_spent_xrp: totalSpentXrp,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to sync buyer derived stats:", error);
  }
};

const filterPurchaseActivitiesByCurrentPurchases = ({
  activities,
  paymentIds,
  recipeIds,
}) => {
  const paymentIdSet = new Set((paymentIds || []).map((id) => String(id)));
  const recipeIdSet = new Set((recipeIds || []).map((id) => String(id)));

  return (activities || []).filter((activity) => {
    if (activity.type !== "purchase") return true;

    const referenceId = String(activity.reference_id || "");
    const metadataRecipeId = String(activity.metadata?.recipe_id || "");

    if (referenceId && paymentIdSet.has(referenceId)) return true;
    if (metadataRecipeId && recipeIdSet.has(metadataRecipeId)) return true;

    return false;
  });
};

const buildPurchaseActivitiesFromCurrentPurchases = (purchaseStats) => {
  return (purchaseStats.purchaseRows || [])
    .map((purchase) => {
      const payment = purchase.payment_id
        ? purchaseStats.paymentsById.get(purchase.payment_id)
        : null;

      const recipe = purchase.recipe_id
        ? purchaseStats.recipesById.get(purchase.recipe_id)
        : null;

      const title = recipe?.title || "Recipe Purchase";
      const amount = payment ? toNumber(payment.amount) : toNumber(recipe?.price);
      const date =
        purchase.unlocked_at ||
        payment?.time_stamp ||
        payment?.updated_at ||
        "";

      return {
        id: `purchase-${purchase.purchase_id}`,
        title: "Recipe Purchase",
        description: `Purchased recipe: ${title}`,
        amount_xrp: amount,
        status: "completed",
        type: "purchase",
        date,
        reference_table: "payments",
        reference_id: purchase.payment_id || purchase.purchase_id,
        metadata: {
          recipe_id: purchase.recipe_id,
          recipe_title: title,
          purchase_id: purchase.purchase_id,
          payment_hash: payment?.payment_hash || null,
        },
      };
    })
    .filter(Boolean);
};

const mergeActivitiesWithPurchaseFallbacks = ({
  activities,
  purchaseStats,
}) => {
  const filteredActivities = filterPurchaseActivitiesByCurrentPurchases({
    activities,
    paymentIds: purchaseStats.paymentIds,
    recipeIds: purchaseStats.recipeIds,
  });

  const existingPurchaseKeys = new Set();

  for (const activity of filteredActivities) {
    if (activity.type !== "purchase") continue;

    const referenceKey =
      activity.reference_table && activity.reference_id
        ? `${activity.reference_table}:${activity.reference_id}`
        : "";

    const recipeKey = activity.metadata?.recipe_id
      ? `recipe:${activity.metadata.recipe_id}`
      : "";

    if (referenceKey) existingPurchaseKeys.add(referenceKey);
    if (recipeKey) existingPurchaseKeys.add(recipeKey);
  }

  const fallbackPurchaseActivities = buildPurchaseActivitiesFromCurrentPurchases(
    purchaseStats
  ).filter((activity) => {
    const referenceKey =
      activity.reference_table && activity.reference_id
        ? `${activity.reference_table}:${activity.reference_id}`
        : "";

    const recipeKey = activity.metadata?.recipe_id
      ? `recipe:${activity.metadata.recipe_id}`
      : "";

    return (
      !existingPurchaseKeys.has(referenceKey) &&
      !existingPurchaseKeys.has(recipeKey)
    );
  });

  return [...filteredActivities, ...fallbackPurchaseActivities]
    .sort(sortActivitiesDesc)
    .slice(0, 50);
};

const buildBuyerProfile = async (userId) => {
  const { data: buyer, error: buyerError } = await db
    .from("buyers")
    .select(
      "display_name, bio, profile_picture, total_purchases, total_spent_xrp, account_balance"
    )
    .eq("user_id", userId)
    .single();

  if (buyerError) throw buyerError;

  const { data: user, error: userError } = await db
    .from("users")
    .select("user_id, email, wallet_address, created_at, role")
    .eq("user_id", userId)
    .single();

  if (userError) throw userError;

  const { count: savedRecipesCount, error: savedRecipesError } = await db
    .from("saved_recipes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (savedRecipesError) throw savedRecipesError;

  const { count: feedbackCount, error: feedbackError } = await db
    .from("feedbacks")
    .select("*", { count: "exact", head: true })
    .eq("buyer_id", userId);

  if (feedbackError) throw feedbackError;

  const purchaseStats = await getPurchasedStatsFromRecipePurchases(userId);

  const effectiveTotalPurchases = purchaseStats.totalPurchases;
  const effectiveTotalSpentXrp = purchaseStats.totalSpentXrp;

  if (
    Number(buyer.total_purchases || 0) !== effectiveTotalPurchases ||
    Number(buyer.total_spent_xrp || 0) !== effectiveTotalSpentXrp
  ) {
    await syncBuyerDerivedStats({
      userId,
      totalPurchases: effectiveTotalPurchases,
      totalSpentXrp: effectiveTotalSpentXrp,
    });
  }

  const userActivities = await activityService.getUserActivities({
    userId,
    limit: 50,
  });

  const mappedActivities = (userActivities || []).map((activity) => ({
    id: activity.activity_id,
    title: activity.title || "Activity",
    description: activity.description || "",
    amount_xrp: Number(activity.amount_xrp || 0),
    status: activity.status || "completed",
    type: activity.type || "purchase",
    date: activity.created_at,
    reference_table: activity.reference_table,
    reference_id: activity.reference_id,
    metadata: activity.metadata || {},
  }));

  const recentActivity = mergeActivitiesWithPurchaseFallbacks({
    activities: mappedActivities,
    purchaseStats,
  });

  const badges = computeBuyerBadges({
    totalPurchases: effectiveTotalPurchases,
    totalSpentXrp: effectiveTotalSpentXrp,
    savedRecipes: savedRecipesCount || 0,
    feedbackCount: feedbackCount || 0,
  });

  const displayName =
    String(buyer.display_name || "").trim() || getEmailFallbackName(user.email);

  return {
    user_id: user.user_id,
    email: user.email || "",
    wallet_address: user.wallet_address || "",
    joined_at: user.created_at || "",
    role: user.role || "buyer",
    display_name: displayName,
    bio: buyer.bio || "",
    profile_picture: buyer.profile_picture || "",
    total_purchases: effectiveTotalPurchases,
    total_spent_xrp: effectiveTotalSpentXrp,
    account_balance: Number(buyer.account_balance || 0),
    saved_recipes_count: Number(savedRecipesCount || 0),
    feedback_count: Number(feedbackCount || 0),
    badges,
    recent_activity: recentActivity,
    notification_count: 0,
    cart_count: 0,
  };
};

const getBuyerProfile = async ({ userId }) => {
  return await buildBuyerProfile(userId);
};

const updateBuyerProfile = async ({ userId, body, file }) => {
  const { data: existingBuyer, error: existingBuyerError } = await db
    .from("buyers")
    .select("display_name, bio, profile_picture")
    .eq("user_id", userId)
    .single();

  if (existingBuyerError) throw existingBuyerError;

  const { data: user, error: userError } = await db
    .from("users")
    .select("email")
    .eq("user_id", userId)
    .single();

  if (userError) throw userError;

  const displayName = sanitizeDisplayName(
    body.displayName,
    getEmailFallbackName(user.email)
  );
  const bio = sanitizeBio(body.bio);

  let profilePicture = existingBuyer.profile_picture || "";

  if (file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error("Only JPG, PNG, and WEBP images are allowed");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Profile image must be 5MB or less");
    }

    const safeBaseName = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const uploadResult = await uploadBufferToCloudinary(file.buffer, {
      folder: `recipechain/buyer-profiles/${userId}`,
      public_id: `${Date.now()}-${safeBaseName || "buyer-profile"}`,
      resource_type: "image",
      overwrite: true,
      use_filename: false,
      unique_filename: false,
      tags: ["recipechain", "buyer-profile"],
      context: {
        app: "RecipeChain",
        module: "buyer-profile",
        user_id: String(userId),
      },
    });

    profilePicture = uploadResult.secure_url;
  }

  const previousDisplayName = String(existingBuyer.display_name || "").trim();
  const previousBio = String(existingBuyer.bio || "").trim();
  const previousProfilePicture = String(
    existingBuyer.profile_picture || ""
  ).trim();

  const nextDisplayName = String(displayName || "").trim();
  const nextBio = String(bio || "").trim();
  const nextProfilePicture = String(profilePicture || "").trim();

  const profileActivity = buildProfileUpdateActivity({
    previousDisplayName,
    nextDisplayName,
    previousBio,
    nextBio,
    previousProfilePicture,
    nextProfilePicture,
  });

  const { error: updateError } = await db
    .from("buyers")
    .update({
      display_name: nextDisplayName,
      bio: nextBio,
      profile_picture: nextProfilePicture,
    })
    .eq("user_id", userId);

  if (updateError) throw updateError;

  if (profileActivity.hasChanges) {
    await activityService.logActivity({
      userId,
      type: "profile_update",
      title: profileActivity.title,
      description: profileActivity.description,
      status: "completed",
      referenceTable: "buyers",
      referenceId: userId,
      metadata: {
        ...profileActivity.metadata,
        previous_display_name:
          previousDisplayName !== nextDisplayName ? previousDisplayName : null,
        new_display_name:
          previousDisplayName !== nextDisplayName ? nextDisplayName : null,
      },
    });
  }

  return await buildBuyerProfile(userId);
};

export default {
  getBuyerProfile,
  updateBuyerProfile,
};
