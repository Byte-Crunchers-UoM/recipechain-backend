import { supabaseAdmin } from "../config/supabase.js";

/**
 * Finds the seller record linked to a specific user.
 *
 * @param {string} userId - User ID from the authenticated session/user table.
 * @returns {Promise<object|null>} Seller row if found, otherwise null.
 */
const findSellerByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * maybeSingle() is used because a seller record may not exist yet,
   * especially before the user starts KYC.
   */
  const { data, error } = await supabaseAdmin
    .from("sellers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Finds another seller using the same normalized NIC/passport number.
 *
 * @param {string} nicNoNormalized - Normalized NIC/passport value used for duplicate checking.
 * @param {string|null} excludeUserId - Current seller user ID to ignore during resubmission/update.
 * @returns {Promise<object|null>} Matching seller row if found, otherwise null.
 */
const findSellerByNicNormalized = async (
  nicNoNormalized,
  excludeUserId = null
) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * Normalized NIC is checked instead of raw NIC to avoid duplicates caused by
   * different casing, spaces, or formatting styles.
   */
  let query = supabaseAdmin
    .from("sellers")
    .select("user_id, nic_no, full_name, verification_status")
    .eq("nic_no_normalized", nicNoNormalized);

  /**
   * During KYC resubmission, the seller's own record should not be treated
   * as a duplicate identity match.
   */
  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Finds another seller using the same normalized phone number.
 *
 * @param {string} phoneNoNormalized - Normalized phone value used for duplicate checking.
 * @param {string|null} excludeUserId - Current seller user ID to ignore during resubmission/update.
 * @returns {Promise<object|null>} Matching seller row if found, otherwise null.
 */
const findSellerByPhoneNormalized = async (
  phoneNoNormalized,
  excludeUserId = null
) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * Normalized phone number is checked to prevent duplicates where the same
   * number is entered in different formats.
   */
  let query = supabaseAdmin
    .from("sellers")
    .select("user_id, phone_no, full_name, verification_status")
    .eq("phone_no_normalized", phoneNoNormalized);

  /**
   * Excluding the current user allows existing sellers to update/resubmit
   * their own phone number without triggering a false duplicate warning.
   */
  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Creates an empty seller record for a user.
 *
 * @param {object} params - Seller creation params.
 * @param {string} params.user_id - User ID that will own the seller profile.
 * @returns {Promise<object>} Created seller row.
 */
const createSeller = async ({ user_id }) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * Seller starts with no verification status because KYC has not been
   * submitted yet. The KYC form/status page handles this initial state.
   */
  const { data, error } = await supabaseAdmin
    .from("sellers")
    .insert([
      {
        user_id,
        verification_status: null,
        verification_submitted_at: null,
        verified_at: null,
        rejection_reason: null,
        kyc_approval_page_seen: false,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Updates a seller row by user ID.
 *
 * @param {string} userId - Seller's user ID.
 * @param {object} updateData - Fields to update in the sellers table.
 * @returns {Promise<object>} Updated seller row.
 */
const updateSellerByUserId = async (userId, updateData) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * user_id is used as the stable link between users and sellers.
   * This keeps seller updates tied to the authenticated account.
   */
  const { data, error } = await supabaseAdmin
    .from("sellers")
    .update(updateData)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Gets all seller KYC data needed by the frontend status/form page.
 *
 * @param {string} userId - Seller's user ID.
 * @returns {Promise<object>} Seller KYC status and submitted details.
 */
const getKycStatusByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * This query returns only the KYC-related fields needed by the frontend.
   * It avoids returning unnecessary seller/database fields.
   */
  const { data, error } = await supabaseAdmin
    .from("sellers")
    .select(`
      verification_status,
      verification_submitted_at,
      verified_at,
      rejection_reason,
      full_name,
      display_name,
      date_of_birth,
      nationality,
      address,
      phone_no,
      phone_no_normalized,
      nic_no,
      nic_no_normalized,
      id_document_front_url,
      id_document_front_public_id,
      id_document_front_resource_type,
      id_document_front_original_name,
      id_document_back_url,
      id_document_back_public_id,
      id_document_back_resource_type,
      id_document_back_original_name,
      cloudinary_public_id,
      id_document_resource_type,
      id_document_original_name,
      kyc_approval_page_seen
    `)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
};

/**
 * Marks that the approved seller has already seen the approval success page.
 *
 * @param {string} userId - Seller's user ID.
 * @returns {Promise<object>} Updated approval-page-seen field.
 */
const markKycApprovalPageSeenByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  /**
   * Once this is true, future logins can route approved sellers directly
   * to the dashboard instead of repeatedly showing the success page.
   */
  const { data, error } = await supabaseAdmin
    .from("sellers")
    .update({
      kyc_approval_page_seen: true,
    })
    .eq("user_id", userId)
    .select("kyc_approval_page_seen")
    .single();

  if (error) throw error;
  return data;
};

export default {
  findSellerByUserId,
  findSellerByNicNormalized,
  findSellerByPhoneNormalized,
  createSeller,
  updateSellerByUserId,
  getKycStatusByUserId,
  markKycApprovalPageSeenByUserId,
};