import { supabase } from "../config/supabase.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";
import activityService from "./activityService.js";

/**
 * Keeps display name safe and readable.
 * If the user gives an invalid/too-short name, fallback prevents empty profile names.
 */
const sanitizeDisplayName = (value, fallback) => {
  const cleaned = String(value || "").trim();
  if (cleaned.length >= 3) return cleaned;
  return fallback;
};

/**
 * Limits bio length so very large text cannot be stored/displayed in the profile UI.
 */
const sanitizeBio = (value) => {
  return String(value || "").trim().slice(0, 500);
};

/**
 * Uses email as fallback profile name when buyer has not set a display name yet.
 */
const getEmailFallbackName = (email) => {
  const safeEmail = String(email || "").trim();
  if (!safeEmail) return "Buyer";
  return safeEmail;
};

const clampProgress = (value, target) => {
  const current = Number(value || 0);
  const max = Number(target || 0);

  if (!Number.isFinite(current) || current <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return current;

  return Math.min(current, max);
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

/**
 * Builds achievement/badge state from buyer activity statistics.
 * These values are calculated for display only; they do not need separate DB rows.
 */
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

/**
 * Builds clear profile update activity text.
 * Display name can safely show from/to values.
 * Bio/introduction is only shown as updated to avoid long messy activity rows.
 */
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

/**
 * Fallback activity builder.
 * This is used only if user_activities table has no records yet.
 * It keeps old payment-based activity working while new activity logging is added.
 */
const getFallbackPaymentActivities = async ({ userId, limit = 10 }) => {
  const { data: recentPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("payment_id, amount, status, time_stamp, recipe_id")
    .eq("buyer_id", userId)
    .order("time_stamp", { ascending: false })
    .limit(limit);

  if (paymentsError) throw paymentsError;

  const recipeIds = (recentPayments || [])
    .map((item) => item.recipe_id)
    .filter(Boolean);

  let recipeMap = {};

  if (recipeIds.length > 0) {
    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("recipe_id, title")
      .in("recipe_id", recipeIds);

    if (recipesError) throw recipesError;

    recipeMap = Object.fromEntries((recipes || []).map((r) => [r.recipe_id, r]));
  }

  return (recentPayments || []).map((payment) => ({
    id: payment.payment_id,
    title: recipeMap[payment.recipe_id]?.title || "Recipe Purchase",
    description: `Purchased recipe: ${
      recipeMap[payment.recipe_id]?.title || "Recipe"
    }`,
    amount_xrp: Number(payment.amount || 0),
    status: payment.status || "pending",
    type: "purchase",
    date: payment.time_stamp,
    reference_table: "payments",
    reference_id: payment.payment_id,
    metadata: {
      recipe_id: payment.recipe_id,
    },
  }));
};

/**
 * Builds the complete buyer profile response used by the frontend profile page.
 */
const buildBuyerProfile = async (userId) => {
  const { data: buyer, error: buyerError } = await supabase
    .from("buyers")
    .select(
      "user_id, display_name, bio, profile_picture, total_purchases, total_spent_xrp, account_balance"
    )
    .eq("user_id", userId)
    .single();

  if (buyerError) throw buyerError;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("user_id, email, wallet_address, created_at, role")
    .eq("user_id", userId)
    .single();

  if (userError) throw userError;

  const { count: savedRecipesCount, error: savedRecipesError } = await supabase
    .from("saved_recipes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (savedRecipesError) throw savedRecipesError;

  const { count: feedbackCount, error: feedbackError } = await supabase
    .from("feedbacks")
    .select("*", { count: "exact", head: true })
    .eq("buyer_id", userId);

  if (feedbackError) throw feedbackError;

  const { count: purchasedRecipeCount, error: purchaseCountError } =
    await supabase
      .from("recipe_purchases")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId);

  if (purchaseCountError) throw purchaseCountError;

  const { count: completedPaymentCount, error: completedPaymentCountError } =
    await supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .eq("payment_type", "recipe_purchase")
      .eq("status", "completed");

  if (completedPaymentCountError) throw completedPaymentCountError;

  const effectiveTotalPurchases = Math.max(
    Number(buyer.total_purchases || 0),
    Number(purchasedRecipeCount || 0),
    Number(completedPaymentCount || 0)
  );

  const userActivities = await activityService.getUserActivities({
    userId,
    limit: 50,
  });

  let recentActivity = (userActivities || []).map((activity) => ({
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

  if (recentActivity.length === 0) {
    recentActivity = await getFallbackPaymentActivities({
      userId,
      limit: 10,
    });
  }

  const badges = computeBuyerBadges({
    totalPurchases: effectiveTotalPurchases,
    totalSpentXrp: buyer.total_spent_xrp || 0,
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
    total_spent_xrp: Number(buyer.total_spent_xrp || 0),
    account_balance: Number(buyer.account_balance || 0),
    saved_recipes_count: Number(savedRecipesCount || 0),
    feedback_count: Number(feedbackCount || 0),
    badges,
    recent_activity: recentActivity,
    notification_count: 0,
    cart_count: 0,
  };
};

/**
 * Returns the logged-in buyer's profile.
 */
const getBuyerProfile = async ({ userId }) => {
  return await buildBuyerProfile(userId);
};

/**
 * Updates buyer profile details and optional profile image.
 * After update, the full rebuilt profile is returned so frontend receives fresh data.
 */
const updateBuyerProfile = async ({ userId, body, file }) => {
  const { data: existingBuyer, error: existingBuyerError } = await supabase
    .from("buyers")
    .select("display_name, bio, profile_picture")
    .eq("user_id", userId)
    .single();

  if (existingBuyerError) throw existingBuyerError;

  const { data: user, error: userError } = await supabase
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

  const { error: updateError } = await supabase
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