import { supabase, supabaseAdmin } from "../config/supabase.js";

// =====================================================
// HELPERS
// =====================================================

export const requestAccountDeletionByUserIdModel = async (userId) => {
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("users")
    .update({
      account_status: "deletion_requested",
      deletion_requested_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

const requireAdminClient = () => {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  return supabaseAdmin;
};

const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const normalizeWalletAddress = (walletAddress) => {
  return String(walletAddress || "").trim();
};

const getEmailPrefix = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const prefix = normalizedEmail.split("@")[0]?.trim();
  return prefix || "buyer";
};

export const deleteMyBuyerAccountPermanentlyByUserIdModel = async (userId) => {
  const admin = requireAdminClient();

  // Delete child/dependent buyer-side records first
  const { error: savedRecipesError } = await admin
    .from("saved_recipes")
    .delete()
    .eq("user_id", userId);

  if (savedRecipesError) throw savedRecipesError;

  const { error: feedbackError } = await admin
    .from("feedbacks")
    .delete()
    .eq("buyer_id", userId);

  if (feedbackError) throw feedbackError;

  const { error: paymentsError } = await admin
    .from("payments")
    .delete()
    .eq("buyer_id", userId);

  if (paymentsError) throw paymentsError;

  const { error: buyerError } = await admin
    .from("buyers")
    .delete()
    .eq("user_id", userId);

  if (buyerError) throw buyerError;

  const { error: userError } = await admin
    .from("users")
    .delete()
    .eq("user_id", userId);

  if (userError) throw userError;

  return { success: true };
};

// =====================================================
// EXISTING CRUD
// =====================================================

export const createUserModel = async (username, email) => {
  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        username: String(username || "").trim(),
        email: normalizeEmail(email),
      },
    ])
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
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
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
    .update({
      username: String(username || "").trim(),
      email: normalizeEmail(email),
    })
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

  if (raw.includes("google")) return "google";
  if (raw.includes("facebook")) return "facebook";
  if (raw.includes("twitter") || raw === "x" || raw.includes("x-twitter")) return "x";
  if (raw.includes("github")) return "github";
  if (raw.includes("email") || raw.includes("passwordless")) return "email";

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
  const admin = requireAdminClient();

  const normalizedEmail = normalizeEmail(email);
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const normalizedProvider = normalizeAuthProvider(authProvider);

  const { data: existingUser, error } = await admin
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) throw error;

  // New user -> create
  if (!existingUser) {
    const { data, error: insertError } = await admin
      .from("users")
      .insert({
        email: normalizedEmail,
        wallet_address: normalizedWalletAddress,
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
  // Backfill missing values only
  const updates = {};

  if (!existingUser.auth_provider) {
    updates.auth_provider = normalizedProvider;
  }

  if (!existingUser.wallet_address && normalizedWalletAddress) {
    updates.wallet_address = normalizedWalletAddress;
  }

  if (Object.keys(updates).length > 0) {
    const { data: updatedUser, error: updateError } = await admin
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
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("users")
    .update({ role: String(role || "").trim().toLowerCase() })
    .eq("email", normalizeEmail(email))
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

export const setUserRoleByUserIdModel = async (userId, role) => {
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("users")
    .update({ role: String(role || "").trim().toLowerCase() })
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
  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
};

// =====================================================
// Buyer / Seller Helpers
// =====================================================

export const ensureBuyerRowModel = async (userId, email) => {
  const admin = requireAdminClient();

  const { data: existingBuyer, error: findError } = await admin
    .from("buyers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  // If row already exists, keep it
  if (existingBuyer) {
    return existingBuyer;
  }

  const displayName = getEmailPrefix(email);

  const { data, error } = await admin
    .from("buyers")
    .insert({
      user_id: userId,
      display_name: displayName,
      bio: "",
      profile_picture: null,
      total_purchases: 0,
      total_spent_xrp: 0,
      account_balance: 0,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

export const ensureSellerRowModel = async (userId) => {
  const admin = requireAdminClient();

  const { data: existingSeller, error: findError } = await admin
    .from("sellers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;
  if (existingSeller) return existingSeller;

  const { data, error } = await admin
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