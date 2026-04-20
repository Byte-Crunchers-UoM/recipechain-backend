import { supabaseAdmin } from "../config/supabase.js";

const findSellerByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const { data, error } = await supabaseAdmin
    .from("sellers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const findSellerByNicNormalized = async (nicNoNormalized, excludeUserId = null) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  let query = supabaseAdmin
    .from("sellers")
    .select("user_id, nic_no, full_name, verification_status")
    .eq("nic_no_normalized", nicNoNormalized);

  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

const findSellerByPhoneNormalized = async (phoneNoNormalized, excludeUserId = null) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  let query = supabaseAdmin
    .from("sellers")
    .select("user_id, phone_no, full_name, verification_status")
    .eq("phone_no_normalized", phoneNoNormalized);

  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

const createSeller = async ({ user_id }) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

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

const updateSellerByUserId = async (userId, updateData) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const { data, error } = await supabaseAdmin
    .from("sellers")
    .update(updateData)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

const getKycStatusByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

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

const markKycApprovalPageSeenByUserId = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

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