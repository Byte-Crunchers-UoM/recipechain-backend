import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import buyerService from "../services/buyerService.js";
import cookbookService from "../services/cookbookService.js";

export const createBuyer = async (req, res) => {
  const { email, wallet_address, display_name, bio } = req.body;
  const testUserId = crypto.randomUUID();

  try {
    const { error: userError } = await supabase.from("users").insert([
      {
        user_id: testUserId,
        email,
        wallet_address,
        role: "buyer",
      },
    ]);

    if (userError) throw userError;

    const safeDisplayName =
      display_name ||
      (typeof email === "string" && email.includes("@")
        ? email.split("@")[0]
        : email || "Buyer");

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

export const getAllBuyers = async (req, res) => {
  try {
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

    const { data: users, error: userError } = await supabase
      .from("users")
      .select("user_id, email, wallet_address")
      .in("user_id", buyerIds);

    if (userError) throw userError;

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

export const updateBuyer = async (req, res) => {
  const { id } = req.params;

  try {
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

export const deleteBuyer = async (req, res) => {
  const { id } = req.params;

  try {
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

export const getMyBuyerProfile = async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

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

export const updateMyBuyerProfile = async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

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

export const getMyCookbook = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

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

export const upsertMyCookbookRecipeReview = async (req, res) => {
  try {
    const buyerId = req.user?.user_id;
    const { recipeId } = req.params;
    const { rating, comment } = req.body || {};
    const files = Array.isArray(req.files) ? req.files : [];

    if (!buyerId) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

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