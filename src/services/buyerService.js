import { supabase } from "../config/supabase.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

const sanitizeDisplayName = (value, fallback) => {
  const cleaned = String(value || "").trim();
  if (cleaned.length >= 3) return cleaned;
  return fallback;
};

const sanitizeBio = (value) => {
  return String(value || "").trim().slice(0, 500);
};

const getEmailFallbackName = (email) => {
  const safeEmail = String(email || "").trim();
  if (!safeEmail) return "Buyer";
  return safeEmail;
};

const computeBuyerBadges = ({
  totalPurchases = 0,
  totalSpentXrp = 0,
  savedRecipes = 0,
  feedbackCount = 0,
}) => {
  return [
    {
      key: "first_purchase",
      title: "First Taste",
      description: "Completed first recipe purchase",
      earned: totalPurchases >= 1,
    },
    {
      key: "top_buyer",
      title: "Top Buyer",
      description: "Purchased 10+ recipes",
      earned: totalPurchases >= 10,
    },
    {
      key: "collector",
      title: "Recipe Collector",
      description: "Saved 10+ recipes",
      earned: savedRecipes >= 10,
    },
    {
      key: "big_supporter",
      title: "Big Supporter",
      description: "Spent 250+ XRP",
      earned: Number(totalSpentXrp) >= 250,
    },
    {
      key: "community_voice",
      title: "Community Voice",
      description: "Left 5+ reviews",
      earned: feedbackCount >= 5,
    },
  ];
};

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

  const { data: recentPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("payment_id, amount, status, time_stamp, recipe_id")
    .eq("buyer_id", userId)
    .order("time_stamp", { ascending: false })
    .limit(5);

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

  const recentActivity = (recentPayments || []).map((payment) => ({
    id: payment.payment_id,
    title: recipeMap[payment.recipe_id]?.title || "Recipe Purchase",
    amount_xrp: Number(payment.amount || 0),
    status: payment.status || "pending",
    type: "purchase",
    date: payment.time_stamp,
  }));

  const badges = computeBuyerBadges({
    totalPurchases: buyer.total_purchases || 0,
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
    total_purchases: Number(buyer.total_purchases || 0),
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

const getBuyerProfile = async ({ userId }) => {
  return await buildBuyerProfile(userId);
};

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

  const { error: updateError } = await supabase
    .from("buyers")
    .update({
      display_name: displayName,
      bio,
      profile_picture: profilePicture,
    })
    .eq("user_id", userId);

  if (updateError) throw updateError;

  return await buildBuyerProfile(userId);
};

export default {
  getBuyerProfile,
  updateBuyerProfile,
};