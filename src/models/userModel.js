import { supabase, supabaseAdmin } from "../config/supabase.js";

/*
  Data access layer - pure database operations using Supabase
  ------------------------------------------------------------
  - supabase          -> normal anon client (existing CRUD)
  - supabaseAdmin     -> service role client (secure backend operations)
*/

// =====================================================
// EXISTING CRUD (Friend's Code) - UNCHANGED (user_id)
// =====================================================

export const createUserModel = async (username, email) => {
  const { data, error } = await supabase
    .from("users")
    .insert([{ username, email }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getUserByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
};

export const getUserByEmailModel = async (email) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
};

export const getAllUsersModel = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

export const updateUserModel = async (id, username, email) => {
  const { data, error } = await supabase
    .from("users")
    .update({ username, email })
    .eq("user_id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteUserModel = async (id) => {
  const { data, error } = await supabase
    .from("users")
    .delete()
    .eq("user_id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// =====================================================
// NEW: Web3Auth + XRPL Integration
// =====================================================

export const upsertWeb3AuthUserModel = async (email, walletAddress) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data: existingUser, error: findError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (findError) throw findError;

  if (!existingUser) {
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        wallet_address: walletAddress,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;
    return newUser;
  }

  if (
    existingUser.wallet_address &&
    existingUser.wallet_address !== walletAddress
  ) {
    throw new Error("Wallet mismatch. Login denied.");
  }

  if (!existingUser.wallet_address) {
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("users")
      .update({ wallet_address: walletAddress })
      .eq("user_id", existingUser.user_id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return updatedUser;
  }

  return existingUser;
};

// =====================================================
// Role Handling
// =====================================================

export const setUserRoleModel = async (email, role) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ role })
    .eq("email", email)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

export const setUserRoleByUserIdModel = async (userId, role) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ role })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

// =====================================================
// Session-based Fetch
// =====================================================

export const getUserByUserIdModel = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
};

// =====================================================
// Buyer Table Handling
// =====================================================

export const ensureBuyerRowModel = async (userId, displayNameEmail) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data: existingBuyer, error: findError } = await supabaseAdmin
    .from("buyers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  if (!existingBuyer) {
    const { error: insertError } = await supabaseAdmin
      .from("buyers")
      .insert({
        user_id: userId,
        display_name: displayNameEmail,
      });

    if (insertError) throw insertError;
  }

  return true;
};

// =====================================================
// Seller Table Handling
// =====================================================

export const ensureSellerRowModel = async (userId) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data: existingSeller, error: findError } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  if (!existingSeller) {
    const { error: insertError } = await supabaseAdmin
      .from("sellers")
      .insert({
        user_id: userId,
        verification_status: null,
        verification_submitted_at: null,
        verified_at: null,
        rejection_reason: null,
      });

    if (insertError) throw insertError;
  }

  return true;
};