import { supabase, supabaseAdmin } from "../config/supabase.js";

/*
  Data access layer - pure database operations using Supabase
  ------------------------------------------------------------
  - supabase      -> normal anon client
  - supabaseAdmin -> service role client
*/

// =====================================================
// EXISTING CRUD
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
// Web3Auth + XRPL
// =====================================================

function formatAuthProvider(provider) {
  const map = {
    google: "Google",
    facebook: "Facebook",
    x: "X",
    twitter: "X",
    github: "GitHub",
    email_passwordless: "Email",
    email: "Email",
  };

  return map[String(provider).toLowerCase()] || provider;
}

export const upsertWeb3AuthUserModel = async (
  email,
  walletAddress,
  authProvider
) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const normalizedProvider = String(authProvider).toLowerCase();

  const { data: existingUser, error: findError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (findError) throw findError;

  // New user
  if (!existingUser) {
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        wallet_address: walletAddress,
        auth_provider: normalizedProvider,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;
    return newUser;
  }

  // Existing email but different provider
  if (
    existingUser.auth_provider &&
    existingUser.auth_provider !== normalizedProvider
  ) {
    const providerName = formatAuthProvider(existingUser.auth_provider);
    throw new Error(
      `This email is already registered with ${providerName}. Please continue with ${providerName}.`
    );
  }

  // Existing email but different wallet
  if (
    existingUser.wallet_address &&
    existingUser.wallet_address !== walletAddress
  ) {
    const providerName = formatAuthProvider(
      existingUser.auth_provider || normalizedProvider
    );
    throw new Error(
      `This email is already registered with ${providerName}. Please continue with ${providerName}.`
    );
  }

  // Backfill missing fields if needed
  const updates = {};

  if (!existingUser.wallet_address) {
    updates.wallet_address = walletAddress;
  }

  if (!existingUser.auth_provider) {
    updates.auth_provider = normalizedProvider;
  }

  if (Object.keys(updates).length > 0) {
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("user_id", existingUser.user_id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return updatedUser;
  }

  return existingUser;
};

// =====================================================
// ROLE HELPERS
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
// SESSION FETCH
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
// BUYER / SELLER ENSURE HELPERS
// =====================================================

export const ensureBuyerRowModel = async (userId, email) => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  const { data: existingBuyer, error: findError } = await supabaseAdmin
    .from("buyers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;
  if (existingBuyer) return existingBuyer;

  const displayName =
    typeof email === "string" && email.includes("@")
      ? email.split("@")[0]
      : "Buyer";

  const { data, error } = await supabaseAdmin
    .from("buyers")
    .insert({
      user_id: userId,
      display_name: displayName,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

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
  if (existingSeller) return existingSeller;

  const { data, error } = await supabaseAdmin
    .from("sellers")
    .insert({
      user_id: userId,
      verification_status: null,
      verification_submitted_at: null,
      verified_at: null,
      rejection_reason: null,
      kyc_approval_page_seen: false,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
};