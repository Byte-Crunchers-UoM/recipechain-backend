import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import buyerService from "../services/buyerService.js";
import cookbookService from "../services/cookbookService.js";

/**
 * Creates a test buyer record directly in users and buyers tables.
 *
 * @param {import("express").Request} req - Request body contains email, wallet_address, display_name, and bio.
 * @param {import("express").Response} res - Response used to return created buyer data.
 * @returns {Promise<void>}
 */
export const createBuyer = async (req, res) => {
  const { email, wallet_address, display_name, bio } = req.body;
  const testUserId = crypto.randomUUID();

  try {
    // This creates the base app user first because buyers depend on users.user_id.
    const { error: userError } = await supabase.from("users").insert([
      {
        user_id: testUserId,
        email,
        wallet_address,
        role: "buyer",
      },
    ]);

    if (userError) throw userError;

    // Use email prefix as fallback so test buyers still have a readable display name.
    const safeDisplayName =
      display_name ||
      (typeof email === "string" && email.includes("@")
        ? email.split("@")[0]
        : email || "Buyer");

    // Buyer-specific profile/stat fields are stored separately from shared user auth data.
    const { error: buyerError } = await supabase.from("buyers").insert([
      {
        user_id: testUserId,
        display_name: safeDisplayName,
        bio: bio || "",
        profile_picture: null,
        total_purchases: 0,
        total_spent_xrp: 0,
        account_balance: 0,
      },
    ]);

    if (buyerError) throw buyerError;

    return res.status(201).json({
      success: true,
      message: "Test buyer created successfully",
      data: { user_id: testUserId, email, display_name: safeDisplayName },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Returns all buyers with their related user email and wallet address.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Response used to return buyer list.
 * @returns {Promise<void>}
 */
export const getAllBuyers = async (req, res) => {
  try {
    // Buyer table holds profile/stat data, while users table holds email and wallet address.
    const { data: buyers, error: buyerError } = await supabase
      .from("buyers")
      .select(
        "user_id, display_name, total_purchases, total_spent_xrp, bio, profile_picture, account_balance"
      );

    if (buyerError) throw buyerError;

    if (!buyers || buyers.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const buyerIds = buyers.map((b) => b.user_id);

    // Fetch matching users in one query to avoid one database request per buyer.
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("user_id, email, wallet_address")
      .in("user_id", buyerIds);

    if (userError) throw userError;

    // Combine buyers and users manually because the tables are queried separately.
    const combinedData = buyers.map((buyer) => {
      const matchingUser = users.find((u) => u.user_id === buyer.user_id);

      return {
        user_id: buyer.user_id,
        display_name: buyer.display_name,
        total_purchases: buyer.total_purchases,
        total_spent_xrp: buyer.total_spent_xrp,
        account_balance: buyer.account_balance,
        bio: buyer.bio,
        profile_picture: buyer.profile_picture,
        users: matchingUser
          ? {
              email: matchingUser.email,
              wallet_address: matchingUser.wallet_address,
            }
          : null,
      };
    });

    return res.status(200).json({ success: true, data: combinedData });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Returns one buyer by user ID with related email and wallet address.
 *
 * @param {import("express").Request} req - Request params contain buyer user ID.
 * @param {import("express").Response} res - Response used to return buyer data.
 * @returns {Promise<void>}
 */
export const getBuyerById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select(
        "user_id, display_name, total_purchases, total_spent_xrp, bio, profile_picture, account_balance"
      )
      .eq("user_id", id)
      .single();

    if (buyerError) throw buyerError;

    // Email and wallet address are stored in users table, not buyers table.
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("email, wallet_address")
      .eq("user_id", id)
      .single();

    if (userError) throw userError;

    return res.status(200).json({
      success: true,
      data: { ...buyerData, users: userData },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: "Buyer not found",
      errorDetails: error.message,
    });
  }
};

/**
 * Updates a buyer record by user ID.
 *
 * @param {import("express").Request} req - Request params contain buyer ID and body contains fields to update.
 * @param {import("express").Response} res - Response used to return update status.
 * @returns {Promise<void>}
 */
export const updateBuyer = async (req, res) => {
  const { id } = req.params;

  try {
    // This generic update is useful for admin/testing flows; user-facing profile updates use updateMyBuyerProfile.
    const { error } = await supabase
      .from("buyers")
      .update(req.body)
      .eq("user_id", id);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Buyer updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Deletes a buyer and the related user record.
 *
 * @param {import("express").Request} req - Request params contain buyer ID.
 * @param {import("express").Response} res - Response used to return delete status.
 * @returns {Promise<void>}
 */
export const deleteBuyer = async (req, res) => {
  const { id } = req.params;

  try {
    // Delete buyer profile first because it depends on the base users table row.
    const { error: buyerError } = await supabase
      .from("buyers")
      .delete()
      .eq("user_id", id);

    if (buyerError) throw buyerError;

    const { error: userError } = await supabase
      .from("users")
      .delete()
      .eq("user_id", id);

    if (userError) throw userError;

    return res.status(200).json({
      success: true,
      message: "Buyer deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Returns the logged-in buyer's own profile.
 *
 * @param {import("express").Request} req - Request must contain req.user from session middleware.
 * @param {import("express").Response} res - Response used to return buyer profile.
 * @returns {Promise<void>}
 */
export const getMyBuyerProfile = async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Service layer owns profile-building logic, including joined data or derived fields.
    const profile = await buyerService.getBuyerProfile({ userId });

    return res.status(200).json({ ok: true, profile });
  } catch (error) {
    console.error("getMyBuyerProfile error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Failed to fetch buyer profile",
    });
  }
};

/**
 * Updates the logged-in buyer's own profile.
 *
 * @param {import("express").Request} req - Request must contain req.user, body fields, and optional uploaded file.
 * @param {import("express").Response} res - Response used to return updated profile.
 * @returns {Promise<void>}
 */
export const updateMyBuyerProfile = async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Service handles validation, allowed fields, and optional profile image upload.
    const profile = await buyerService.updateBuyerProfile({
      userId,
      body: req.body,
      file: req.file,
    });

    return res.status(200).json({
      ok: true,
      message: "Profile updated successfully",
      profile,
    });
  } catch (error) {
    console.error("updateMyBuyerProfile error:", error);
    return res.status(400).json({
      ok: false,
      message: error.message || "Failed to update buyer profile",
    });
  }
};

/**
 * Returns purchased cookbook items for the logged-in buyer.
 *
 * @param {import("express").Request} req - Request query may contain q, reviewStatus, and favoritesOnly.
 * @param {import("express").Response} res - Response used to return cookbook items.
 * @returns {Promise<void>}
 */
export const getMyCookbook = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Query params make one endpoint support search, review filtering, and favorites filtering.
    const search = String(req.query.q || "");
    const reviewStatus = String(req.query.reviewStatus || "all");
    const favoritesOnly =
      String(req.query.favoritesOnly || "false").toLowerCase() === "true";

    const items = await cookbookService.getMyCookbook({
      buyerId,
      search,
      reviewStatus,
      favoritesOnly,
    });

    return res.status(200).json({
      ok: true,
      items,
    });
  } catch (error) {
    console.error("getMyCookbook error:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to fetch cookbook",
    });
  }
};

/**
 * Returns full details for one purchased cookbook recipe.
 *
 * @param {import("express").Request} req - Request params contain recipeId and session contains buyer ID.
 * @param {import("express").Response} res - Response used to return recipe details.
 * @returns {Promise<void>}
 */
export const getMyCookbookRecipeDetails = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;
    const { recipeId } = req.params;

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Service should ensure the buyer actually owns/unlocked this recipe.
    const recipe = await cookbookService.getCookbookRecipeDetails({
      buyerId,
      recipeId,
    });

    return res.status(200).json({
      ok: true,
      recipe,
    });
  } catch (error) {
    console.error("getMyCookbookRecipeDetails error:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to fetch recipe details",
    });
  }
};

/**
 * Returns the recipe data needed for the buyer review form.
 *
 * @param {import("express").Request} req - Request params contain recipeId and session contains buyer ID.
 * @param {import("express").Response} res - Response used to return review page data.
 * @returns {Promise<void>}
 */
export const getMyCookbookRecipeForReview = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;
    const { recipeId } = req.params;

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Review page needs ownership validation plus any existing review state.
    const recipe = await cookbookService.getCookbookRecipeForReview({
      buyerId,
      recipeId,
    });

    return res.status(200).json({
      ok: true,
      recipe,
    });
  } catch (error) {
    console.error("getMyCookbookRecipeForReview error:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to fetch recipe review data",
    });
  }
};

/**
 * Creates or updates the logged-in buyer's review for a purchased recipe.
 *
 * @param {import("express").Request} req - Request params contain recipeId, body contains rating/comment, and files may contain photos.
 * @param {import("express").Response} res - Response used to return saved review result.
 * @returns {Promise<void>}
 */
export const upsertMyCookbookRecipeReview = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;
    const { recipeId } = req.params;
    const { rating, comment } = req.body || {};

    // Multer may provide req.files only when images are attached.
    const files = Array.isArray(req.files) ? req.files : [];

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Upsert allows one buyer review per recipe while still supporting edit review.
    const result = await cookbookService.upsertRecipeReview({
      buyerId,
      recipeId,
      rating,
      comment,
      files,
    });

    return res.status(200).json({
      ok: true,
      message: "Review saved successfully",
      ...result,
    });
  } catch (error) {
    console.error("upsertMyCookbookRecipeReview error:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to save review",
    });
  }
};

/**
 * Toggles a purchased recipe as favorite/unfavorite for the logged-in buyer.
 *
 * @param {import("express").Request} req - Request params contain recipeId and session contains user ID.
 * @param {import("express").Response} res - Response used to return favorite state.
 * @returns {Promise<void>}
 */
export const toggleMyCookbookFavorite = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { recipeId } = req.params;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    // Service owns the current favorite state check and database update.
    const result = await cookbookService.toggleFavorite({
      userId,
      recipeId,
    });

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("toggleMyCookbookFavorite error:", error);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Failed to update favorite",
    });
  }
};