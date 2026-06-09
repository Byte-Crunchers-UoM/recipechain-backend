import { supabaseAdmin } from "../config/supabase.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

const MAX_REVIEW_IMAGES = 5;
const MAX_REVIEW_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_REVIEW_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Returns the Supabase admin client or throws a clear backend config error.
 * Admin client is required here because cookbook/review operations need trusted DB access.
 */
function requireAdminClient() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  return supabaseAdmin;
}

/**
 * Keeps recipe rating averages consistent to 2 decimal places.
 * This prevents UI display issues from long floating-point values.
 */
function normalizeRatingAvg(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

/**
 * Normalizes search/filter text before comparing values.
 * This makes cookbook search case-insensitive and spacing-safe.
 */
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Validates review image uploads before sending them to Cloudinary.
 * Backend validation is required because frontend validation can be bypassed.
 */
function validateReviewFiles(files = []) {
  if (!Array.isArray(files)) return;

  if (files.length > MAX_REVIEW_IMAGES) {
    const err = new Error(`You can upload up to ${MAX_REVIEW_IMAGES} photos only`);
    err.statusCode = 400;
    throw err;
  }

  for (const file of files) {
    if (!ALLOWED_REVIEW_IMAGE_TYPES.includes(file.mimetype)) {
      const err = new Error("Only JPG, PNG, and WEBP images are allowed");
      err.statusCode = 400;
      throw err;
    }

    if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
      const err = new Error("Each review photo must be 5MB or less");
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * Confirms that the buyer actually purchased/unlocked the recipe.
 * This prevents users from viewing/reviewing/favoriting recipes they do not own.
 */
async function ensureBuyerOwnsRecipe({ buyerId, recipeId }) {
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("recipe_purchases")
    .select("purchase_id, buyer_id, recipe_id, unlocked_at")
    .eq("buyer_id", buyerId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const err = new Error("Recipe not found in your cookbook");
    err.statusCode = 403;
    throw err;
  }

  return data;
}

/**
 * Recalculates recipe average rating after a review is created or updated.
 * This keeps the recipe card/list rating in sync with latest feedbacks.
 */
async function recalculateRecipeRating(recipeId) {
  const admin = requireAdminClient();

  const { data: feedbacks, error: feedbackError } = await admin
    .from("feedbacks")
    .select("rating")
    .eq("recipe_id", recipeId);

  if (feedbackError) throw feedbackError;

  const ratings = (feedbacks || [])
    .map((item) => Number(item.rating))
    .filter((value) => Number.isFinite(value) && value > 0);

  const average =
    ratings.length > 0
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : 0;

  const ratingAvg = normalizeRatingAvg(average);

  const { error: updateError } = await admin
    .from("recipes")
    .update({ rating_avg: ratingAvg })
    .eq("recipe_id", recipeId);

  if (updateError) throw updateError;

  return ratingAvg;
}

/**
 * Gets uploaded images for a specific review.
 * Sorting keeps the image order stable in the frontend.
 */
async function getFeedbackImages(feedbackId) {
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("feedback_images")
    .select("image_id, image_url, cloudinary_public_id, sort_order, created_at")
    .eq("feedback_id", feedbackId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Returns the logged-in buyer's cookbook items.
 * Supports search, review-status filtering, and favorites-only filtering.
 */
async function getMyCookbook({
  buyerId,
  search = "",
  reviewStatus = "all",
  favoritesOnly = false,
}) {
  const admin = requireAdminClient();

  /**
   * Purchases are the source of truth for cookbook access.
   * If a recipe is not in recipe_purchases, it should not appear in My Cookbook.
   */
  const { data: purchases, error: purchaseError } = await admin
    .from("recipe_purchases")
    .select("purchase_id, recipe_id, unlocked_at")
    .eq("buyer_id", buyerId)
    .order("unlocked_at", { ascending: false });

  if (purchaseError) throw purchaseError;

  if (!purchases || purchases.length === 0) {
    return [];
  }

  const recipeIds = purchases.map((item) => item.recipe_id);

  /**
   * Fetch recipes in one query instead of one query per purchase.
   * This is faster and avoids unnecessary database calls.
   */
  const { data: recipes, error: recipeError } = await admin
    .from("recipes")
    .select(`
      recipe_id,
      title,
      description,
      image_url,
      difficulty_level,
      prep_time,
      cook_time,
      servings,
      price,
      rating_avg,
      chef_id,
      created_at,
      status
    `)
    .in("recipe_id", recipeIds);

  if (recipeError) throw recipeError;

  /**
   * Fetch buyer feedbacks for these recipes so each cookbook card can show
   * whether the buyer already reviewed the recipe.
   */
  const { data: feedbacks, error: feedbackError } = await admin
    .from("feedbacks")
    .select("feedback_id, recipe_id, buyer_id, rating, comment, created_at")
    .eq("buyer_id", buyerId)
    .in("recipe_id", recipeIds);

  if (feedbackError) throw feedbackError;

  /**
   * Fetch saved recipes so cookbook cards can show favorite state immediately.
   */
  const { data: savedRecipes, error: savedError } = await admin
    .from("saved_recipes")
    .select("saved_id, recipe_id")
    .eq("user_id", buyerId)
    .in("recipe_id", recipeIds);

  if (savedError) throw savedError;

  const feedbackMap = new Map(
    (feedbacks || []).map((item) => [item.recipe_id, item])
  );

  const savedMap = new Map(
    (savedRecipes || []).map((item) => [item.recipe_id, item.saved_id])
  );

  let items = purchases
    .map((purchase) => {
      const recipe = (recipes || []).find(
        (r) => r.recipe_id === purchase.recipe_id
      );

      if (!recipe) return null;

      const myFeedback = feedbackMap.get(purchase.recipe_id) || null;
      const savedId = savedMap.get(purchase.recipe_id) || null;

      return {
        purchase_id: purchase.purchase_id,
        unlocked_at: purchase.unlocked_at,
        recipe_id: recipe.recipe_id,
        title: recipe.title,
        description: recipe.description,
        image_url: recipe.image_url,
        difficulty_level: recipe.difficulty_level,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        servings: recipe.servings,
        price: recipe.price,
        rating_avg: recipe.rating_avg,
        status: recipe.status,
        has_reviewed: Boolean(myFeedback),
        is_favorite: Boolean(savedId),
        saved_id: savedId,
        my_feedback: myFeedback
          ? {
              feedback_id: myFeedback.feedback_id,
              rating: myFeedback.rating,
              comment: myFeedback.comment,
              created_at: myFeedback.created_at,
              images: [],
            }
          : null,
      };
    })
    .filter(Boolean);

  const q = normalizeText(search);

  if (q) {
    items = items.filter((item) =>
      [item.title, item.description, item.difficulty_level]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(q))
    );
  }

  if (reviewStatus === "reviewed") {
    items = items.filter((item) => item.has_reviewed);
  } else if (reviewStatus === "pending") {
    items = items.filter((item) => !item.has_reviewed);
  }

  if (favoritesOnly) {
    items = items.filter((item) => item.is_favorite);
  }

  return items;
}

/**
 * Returns full recipe details for a recipe already unlocked by the buyer.
 * Used by the cookbook recipe detail modal/page.
 */
async function getCookbookRecipeDetails({ buyerId, recipeId }) {
  const admin = requireAdminClient();

  await ensureBuyerOwnsRecipe({ buyerId, recipeId });

  const { data: recipe, error: recipeError } = await admin
    .from("recipes")
    .select(`
      recipe_id,
      title,
      description,
      image_url,
      difficulty_level,
      prep_time,
      cook_time,
      servings,
      price,
      rating_avg,
      chef_id,
      created_at,
      chef_note,
      ingredients,
      instructions,
      status
    `)
    .eq("recipe_id", recipeId)
    .single();

  if (recipeError) throw recipeError;

  const { data: feedback, error: feedbackError } = await admin
    .from("feedbacks")
    .select("feedback_id, buyer_id, recipe_id, rating, comment, created_at")
    .eq("buyer_id", buyerId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (feedbackError) throw feedbackError;

  let images = [];

  if (feedback?.feedback_id) {
    images = await getFeedbackImages(feedback.feedback_id);
  }

  return {
    ...recipe,
    my_feedback: feedback
      ? {
          feedback_id: feedback.feedback_id,
          rating: feedback.rating,
          comment: feedback.comment,
          created_at: feedback.created_at,
          images,
        }
      : null,
  };
}

/**
 * Returns recipe and existing review data needed by the review form.
 * This allows the same endpoint to support both create-review and edit-review UI.
 */
async function getCookbookRecipeForReview({ buyerId, recipeId }) {
  const admin = requireAdminClient();

  await ensureBuyerOwnsRecipe({ buyerId, recipeId });

  const { data: recipe, error: recipeError } = await admin
    .from("recipes")
    .select(`
      recipe_id,
      title,
      description,
      image_url,
      difficulty_level,
      prep_time,
      cook_time,
      servings,
      price,
      rating_avg,
      chef_id,
      created_at
    `)
    .eq("recipe_id", recipeId)
    .single();

  if (recipeError) throw recipeError;

  const { data: feedback, error: feedbackError } = await admin
    .from("feedbacks")
    .select("feedback_id, buyer_id, recipe_id, rating, comment, created_at")
    .eq("buyer_id", buyerId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (feedbackError) throw feedbackError;

  let images = [];

  if (feedback?.feedback_id) {
    images = await getFeedbackImages(feedback.feedback_id);
  }

  return {
    ...recipe,
    my_feedback: feedback
      ? {
          feedback_id: feedback.feedback_id,
          rating: feedback.rating,
          comment: feedback.comment,
          created_at: feedback.created_at,
          images,
        }
      : null,
  };
}

/**
 * Uploads new review images to Cloudinary and stores their URLs in feedback_images.
 * Existing images are kept, so the total image count is checked before upload.
 */
async function uploadReviewImages({ buyerId, recipeId, feedbackId, files }) {
  const admin = requireAdminClient();

  if (!files?.length) return await getFeedbackImages(feedbackId);

  const existingImages = await getFeedbackImages(feedbackId);
  const existingCount = existingImages.length;

  if (existingCount + files.length > MAX_REVIEW_IMAGES) {
    const err = new Error(
      `You can keep only ${MAX_REVIEW_IMAGES} photos per review. You already have ${existingCount}.`
    );
    err.statusCode = 400;
    throw err;
  }

  const uploadedRows = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];

    const uploadResult = await uploadBufferToCloudinary(file.buffer, {
      folder: `recipechain/reviews/${buyerId}/${recipeId}`,
      public_id: `${Date.now()}-${index + 1}`,
      resource_type: "image",
      overwrite: false,
      use_filename: false,
      unique_filename: true,
      tags: ["recipechain", "buyer-review"],
      context: {
        app: "RecipeChain",
        module: "buyer-review",
        user_id: String(buyerId),
        recipe_id: String(recipeId),
        feedback_id: String(feedbackId),
      },
    });

    uploadedRows.push({
      feedback_id: feedbackId,
      image_url: uploadResult.secure_url,
      cloudinary_public_id: uploadResult.public_id,
      sort_order: existingCount + index,
    });
  }

  const { error } = await admin.from("feedback_images").insert(uploadedRows);

  if (error) throw error;

  return await getFeedbackImages(feedbackId);
}

/**
 * Creates or updates the buyer's review for a purchased recipe.
 * A buyer can have one review per recipe, so this uses upsert-style logic.
 */
async function upsertRecipeReview({
  buyerId,
  recipeId,
  rating,
  comment,
  files = [],
}) {
  const admin = requireAdminClient();

  await ensureBuyerOwnsRecipe({ buyerId, recipeId });
  validateReviewFiles(files);

  const cleanRating = Number(rating);
  const cleanComment = String(comment || "").trim();

  if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
    const err = new Error("Rating must be an integer between 1 and 5");
    err.statusCode = 400;
    throw err;
  }

  if (!cleanComment) {
    const err = new Error("Review comment is required");
    err.statusCode = 400;
    throw err;
  }

  if (cleanComment.length > 500) {
    const err = new Error("Review comment must be 500 characters or less");
    err.statusCode = 400;
    throw err;
  }

  const { data: existing, error: existingError } = await admin
    .from("feedbacks")
    .select("feedback_id")
    .eq("buyer_id", buyerId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existingError) throw existingError;

  let feedback;

  if (existing) {
    /**
     * Existing feedback means the buyer is editing their review.
     * Images are added separately so review text/rating updates do not remove old images.
     */
    const { data, error } = await admin
      .from("feedbacks")
      .update({
        rating: cleanRating,
        comment: cleanComment,
      })
      .eq("feedback_id", existing.feedback_id)
      .select("feedback_id, buyer_id, recipe_id, rating, comment, created_at")
      .single();

    if (error) throw error;
    feedback = data;
  } else {
    /**
     * No previous feedback means this is the buyer's first review for this recipe.
     */
    const { data, error } = await admin
      .from("feedbacks")
      .insert({
        buyer_id: buyerId,
        recipe_id: recipeId,
        rating: cleanRating,
        comment: cleanComment,
      })
      .select("feedback_id, buyer_id, recipe_id, rating, comment, created_at")
      .single();

    if (error) throw error;
    feedback = data;
  }

  const images = await uploadReviewImages({
    buyerId,
    recipeId,
    feedbackId: feedback.feedback_id,
    files,
  });

  const ratingAvg = await recalculateRecipeRating(recipeId);

  return {
    feedback: {
      ...feedback,
      images,
    },
    rating_avg: ratingAvg,
  };
}

/**
 * Toggles favorite state for a purchased recipe.
 * The recipe must be owned by the buyer before it can be favorited.
 */
async function toggleFavorite({ userId, recipeId }) {
  const admin = requireAdminClient();

  await ensureBuyerOwnsRecipe({ buyerId: userId, recipeId });

  const { data: existing, error: existingError } = await admin
    .from("saved_recipes")
    .select("saved_id")
    .eq("user_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { error: deleteError } = await admin
      .from("saved_recipes")
      .delete()
      .eq("saved_id", existing.saved_id);

    if (deleteError) throw deleteError;

    return {
      is_favorite: false,
      saved_id: null,
      message: "Removed from favorites",
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("saved_recipes")
    .insert({
      user_id: userId,
      recipe_id: recipeId,
    })
    .select("saved_id")
    .single();

  if (insertError) throw insertError;

  return {
    is_favorite: true,
    saved_id: inserted.saved_id,
    message: "Added to favorites",
  };
}

export default {
  getMyCookbook,
  getCookbookRecipeDetails,
  getCookbookRecipeForReview,
  upsertRecipeReview,
  toggleFavorite,
};