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

function normalizeAuthProvider(provider) {
  const raw = String(provider || "").toLowerCase().trim();

  if (
    raw.includes("google") ||
    raw === "w3a-google" ||
    raw === "google"
  ) {
    return "google";
  }

  if (
    raw.includes("facebook") ||
    raw === "w3a-facebook" ||
    raw === "facebook"
  ) {
    return "facebook";
  }

  if (
    raw === "x" ||
    raw.includes("twitter") ||
    raw.includes("x-twitter") ||
    raw === "w3a-twitter"
  ) {
    return "x";
  }

  if (
    raw.includes("github") ||
    raw === "w3a-github" ||
    raw === "github"
  ) {
    return "github";
  }

  if (
    raw.includes("email") ||
    raw.includes("passwordless") ||
    raw === "email_passwordless"
  ) {
    return "email";
  }

  return raw || "unknown";
}

function formatAuthProvider(provider) {
  const normalized = normalizeAuthProvider(provider);

  const map = {
    google: "Google",
    facebook: "Facebook",
    x: "X",
    github: "GitHub",
    email: "Email",
    unknown: "your original sign-in method",
  };

  return map[normalized] || provider;
}

export const upsertWeb3AuthUserModel = async (
  email,
  walletAddress,
  authProvider
) => {
  const normalizedProvider = normalizeAuthProvider(authProvider);

  const { data: existingUser, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;

  // New user -> create
  if (!existingUser) {
    const { data, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        wallet_address: walletAddress,
        auth_provider: normalizedProvider,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;
    return data;
  }

  const existingProvider = normalizeAuthProvider(existingUser.auth_provider);

  // Same email + different provider -> block
  if (existingProvider && existingProvider !== normalizedProvider) {
    const providerName = formatAuthProvider(existingProvider);

    throw new Error(
      `This email is already registered with ${providerName}. Please login using ${providerName}.`
    );
  }

  // Same provider -> allow existing account
  // Optional: backfill missing provider/wallet
  const updates = {};

  if (!existingUser.auth_provider) {
    updates.auth_provider = normalizedProvider;
  }

  if (!existingUser.wallet_address) {
    updates.wallet_address = walletAddress;
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