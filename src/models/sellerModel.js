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
    .select(
      `
      verification_status,
      verification_submitted_at,
      verified_at,
      rejection_reason,
      full_name,
      date_of_birth,
      nationality,
      address,
      phone_no,
      id_photo_path
    `
    )
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
};

export default {
  findSellerByUserId,
  createSeller,
  updateSellerByUserId,
  getKycStatusByUserId,
};