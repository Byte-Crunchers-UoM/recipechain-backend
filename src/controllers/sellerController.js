import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import sellerService from "../services/sellerService.js";

const getAuthenticatedUserId = (req) => req.session?.user_id || req.user?.user_id;

/**
 * Creates a new seller profile alongside a parent user account.
 * Initializes empty seller stats in the database.
 *
 * @param {import("express").Request} req - Request body contains seller and user details.
 * @param {import("express").Response} res - Response used to return created seller data.
 * @returns {Promise<void>}
 */
export const createSeller = async (req, res) => {
  const {
    email,
    wallet_address,
    full_name,
    nationality,
    address,
    Nic_no,
    phone_no,
    Id_photo_path,
    bio,
    display_name,
    experince,
    profile_photo,
    social_links,
  } = req.body;

  const testUserId = crypto.randomUUID();

  try {
    const { error: userError } = await supabase.from('users').insert([{ 
      user_id: testUserId, 
      email: email, 
      wallet_address: wallet_address, 
      role: 'seller' 
    }]);

    
    
    if (userError) throw userError;

    const { error: sellerError } = await supabase.from('sellers').insert([{ 
      user_id: testUserId,
      verification_status: 'pending', // Matches your DB column name
      full_name: full_name || '',
      nationality: nationality || '',
      address: address || '',
      nic_no: nic_no || '',
      phone_no: phone_no || '',
      id_document_front_url: id_document_front_url || '',
      id_document_back_url: id_document_back_url || '',
      bio: bio || '',
      display_name: display_name || 'New Seller',
      experience: experience || '',
      profile_photo: profile_photo || '',
      social_links: social_links || null,
      total_recipes: 0,
      active_recipes: 0,
      total_sales: 0,
      earnings_xrp: 0, // Matches your DB screenshot
      rating: 0,
      account_balance: 0,
      
    }]);

    if (sellerError) throw sellerError;

    return res.status(201).json({
      success: true,
      message: "Seller created successfully and is pending verification",
      data: {
        user_id: testUserId,
        email,
        display_name: display_name || "New Seller",
        status: "pending",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Retrieves a list of all sellers on the platform.
 * Combines seller profile data with base user data.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Response used to return seller list.
 * @returns {Promise<void>}
 */
export const getAllSellers = async (req, res) => {
  try {
    const { data: sellers, error: sellerError } = await supabase
      .from("sellers")
      .select("*");

    if (sellerError) throw sellerError;

    const sellerIds = sellers.map(s => s.user_id);
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("user_id, email, wallet_address")
      .in("user_id", sellerIds);

    if (userError) throw userError;

    const combinedData = sellers.map(seller => {
      const matchingUser = users.find(u => u.user_id === seller.user_id);
      return {
        ...seller,
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
 * Retrieves detailed information about a specific seller by user ID.
 *
 * @param {import("express").Request} req - Request params contain seller user ID.
 * @param {import("express").Response} res - Response used to return seller data.
 * @returns {Promise<void>}
 */
export const getSellerById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('*')
      .eq('user_id', id)
      .single();

    if (sellerError) throw sellerError;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("email, wallet_address")
      .eq("user_id", id)
      .single();

    if (userError) throw userError;

    return res.status(200).json({ 
      success: true, 
      data: { ...sellerData, users: userData } 
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: "Seller not found",
      errorDetails: error.message,
    });
  }
};


export const verifySeller = async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason, kyc_approval_page_seen } = req.body;

  try {
    // Normalize status to lowercase to ensure the 'if' check works
    const normalizedStatus = status ? status.toLowerCase() : '';

    const { data, error } = await supabase
      .from('sellers')
      .update({ 
        verification_status: normalizedStatus,
        // CRITICAL: Only set to null if status is 'approved'
        // If it's 'rejected', we take the reason sent from the frontend
        rejection_reason: normalizedStatus === 'rejected' ? rejection_reason : null,
        verified_at: normalizedStatus === 'approved' ? new Date().toISOString() : null,
        kyc_approval_page_seen: kyc_approval_page_seen ?? false
      })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    
    return res.status(200).json({ 
      success: true, 
      message: `Seller status updated to ${normalizedStatus}`, 
      data 
    });
  } catch (error) {
    console.error("Update Error:", error.message);
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// ... keep your existing updateSeller and deleteSeller functions here ...

// 5. DELETE: Remove a seller account permanently
/**
 * Updates a seller's public profile details.
 *
 * @param {import("express").Request} req - Request params contain seller user ID and body contains update fields.
 * @param {import("express").Response} res - Response used to return update status.
 * @returns {Promise<void>}
 */
export const updateSeller = async (req, res) => {
  const { id } = req.params;

  const {
    display_name,
    bio,
    profile_photo,
    full_name,
    nationality,
    address,
    phone_no,
    experince,
    social_links,
  } = req.body;

  const updates = Object.fromEntries(
    Object.entries({
      display_name,
      bio,
      profile_photo,
      full_name,
      nationality,
      address,
      phone_no,
      experince,
      social_links,
    }).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid seller fields provided for update",
    });
  }

  try {
    const { error } = await supabase
      .from("sellers")
      .update(updates)
      .eq("user_id", id);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Seller updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};

/**
 * Deletes a seller account completely from the database.
 * Removes both the seller profile and related user record.
 *
 * @param {import("express").Request} req - Request params contain seller user ID.
 * @param {import("express").Response} res - Response used to return delete status.
 * @returns {Promise<void>}
 */
export const deleteSeller = async (req, res) => {
  const { id } = req.params;

  try {
    const { error: sellerError } = await supabase
      .from("sellers")
      .delete()
      .eq("user_id", id);

    if (sellerError) throw sellerError;

    const { error: userError } = await supabase
      .from("users")
      .delete()
      .eq("user_id", id);

    if (userError) throw userError;

    return res.status(200).json({
      success: true,
      message: "Seller deleted permanently",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      errorDetails: error.message,
    });
  }
};


/**
 * Submits seller KYC details and uploaded ID documents.
 *
 * @param {import("express").Request} req - Request containing session user ID, KYC form body, and uploaded files.
 * @param {import("express").Response} res - Response used to return submission result.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const submitKyc = async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    const result = await sellerService.submitKyc({
      userId,
      body: req.body,
      files: req.files,
    });

    return res.status(200).json({
      message: "KYC submitted successfully",
      data: result,
    });
  } catch (error) {
    if (error?.name === "DuplicateSellerIdentityError") {
      return res.status(error.statusCode || 409).json({
        message: "duplicate_seller_identity",
        field: error.field,
        status: error.status,
        friendlyMessage: error.friendlyMessage,
      });
    }

    if (typeof next === "function") {
      return next(error);
    }

    return res.status(500).json({
      message: error.message || "Failed to submit seller KYC",
    });
  }
};

/**
 * Returns the logged-in seller's current KYC status.
 *
 * @param {import("express").Request} req - Request containing session user ID.
 * @param {import("express").Response} res - Response used to return KYC status.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const getKycStatus = async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    const status = await sellerService.getKycStatus(userId);

    return res.status(200).json({
      data: status,
    });
  } catch (error) {
    if (typeof next === "function") {
      return next(error);
    }

    return res.status(500).json({
      message: error.message || "Failed to fetch seller KYC status",
    });
  }
};

/**
 * Marks the seller approval success page as already seen.
 *
 * @param {import("express").Request} req - Request containing session user ID.
 * @param {import("express").Response} res - Response used to return update result.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const markKycApprovalPageSeen = async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    const result = await sellerService.markKycApprovalPageSeen(userId);

    return res.status(200).json({
      message: "KYC approval page marked as seen",
      data: result,
    });
  } catch (error) {
    if (typeof next === "function") {
      return next(error);
    }

    return res.status(500).json({
      message: error.message || "Failed to mark KYC approval page as seen",
    });
  }
};

export default {
  createSeller,
  getAllSellers,
  getSellerById,
  updateSeller,
  deleteSeller,
  submitKyc,
  getKycStatus,
  markKycApprovalPageSeen,
};