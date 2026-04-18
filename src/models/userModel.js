import { supabase, supabaseAdmin } from "../config/supabase.js";

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
// Web3Auth + XRPL Integration
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

  // Fill in missing provider or wallet
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
// Optional buyer helper
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

  const { data, error } = await supabaseAdmin
    .from("buyers")
    .insert({
      user_id: userId,
      display_name: email.split("@")[0],
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
};