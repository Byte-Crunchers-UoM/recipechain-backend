import { supabase, supabaseAdmin } from "../config/supabase.js";

/**
 * Marks a user account as deletion requested instead of deleting it immediately.
 *
 * @param {string} userId - User ID of the account owner.
 * @returns {Promise<object>} Updated user row.
 */
export const requestAccountDeletionByUserIdModel = async (userId) => {
  const admin = requireAdminClient();

  /**
   * This is a soft-delete request flow.
   * It keeps the account data available for admin review or delayed deletion.
   */
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

/**
 * Returns the Supabase admin client or throws a clear configuration error.
 *
 * @returns {object} Supabase admin client.
 */
const requireAdminClient = () => {
  if (!supabaseAdmin) {
    /**
     * Admin client is needed for protected server-side operations that may bypass
     * normal user-level Supabase permissions.
     */
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in backend .env");
  }

  return supabaseAdmin;
};

/**
 * Normalizes emails before storing/searching to prevent duplicate accounts
 * with different casing or extra spaces.
 *
 * @param {string} email - Raw email value.
 * @returns {string} Normalized email.
 */
const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

/**
 * Normalizes wallet address input before storing it.
 *
 * @param {string} walletAddress - Raw XRPL wallet address.
 * @returns {string} Trimmed wallet address.
 */
const normalizeWalletAddress = (walletAddress) => {
  return String(walletAddress || "").trim();
};

/**
 * Builds a readable default display name from email.
 *
 * @param {string} email - User email.
 * @returns {string} Email prefix or fallback name.
 */
const getEmailPrefix = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const prefix = normalizedEmail.split("@")[0]?.trim();

  return prefix || "buyer";
};

/**
 * Permanently deletes a buyer account and dependent buyer-side records.
 *
 * @param {string} userId - User ID of the buyer.
 * @returns {Promise<{success: boolean}>} Delete result.
 */
export const deleteMyBuyerAccountPermanentlyByUserIdModel = async (userId) => {
  const admin = requireAdminClient();

  /**
   * Delete child/dependent records first to avoid foreign-key constraint errors.
   * The base users row is deleted last because other tables depend on it.
   */
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

/**
 * Creates a basic user row.
 *
 * @param {string} username - User display username.
 * @param {string} email - User email address.
 * @returns {Promise<object>} Created user row.
 */
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

/**
 * Finds a user by user_id.
 *
 * @param {string} id - User ID.
 * @returns {Promise<object|null>} User row or null when not found.
 */
export const getUserByIdModel = async (id) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", id)
    .single();

  /**
   * PGRST116 means no row was found.
   * Returning null lets the service/controller handle "not found" cleanly.
   */
  if (error && error.code !== "PGRST116") throw error;
  return data;
};

/**
 * Finds a user by normalized email.
 *
 * @param {string} email - User email address.
 * @returns {Promise<object|null>} User row or null when not found.
 */
export const getUserByEmailModel = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  /**
   * Missing user is not always an error because signup/sync flows may need
   * to check whether an account already exists.
   */
  if (error && error.code !== "PGRST116") throw error;
  return data;
};

/**
 * Returns all users, newest first.
 *
 * @returns {Promise<object[]>} User rows.
 */
export const getAllUsersModel = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

/**
 * Updates username and email for a user.
 *
 * @param {string} id - User ID.
 * @param {string} username - New username.
 * @param {string} email - New email.
 * @returns {Promise<object>} Updated user row.
 */
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

/**
 * Deletes a user by user_id.
 *
 * @param {string} id - User ID.
 * @returns {Promise<object>} Deleted user row.
 */
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

/**
 * Converts provider names from Web3Auth into one stable internal value.
 *
 * @param {string} provider - Raw provider name from Web3Auth.
 * @returns {string} Normalized provider name.
 */
function normalizeAuthProvider(provider) {
  const raw = String(provider || "").toLowerCase().trim();

  if (raw.includes("google")) return "google";
  if (raw.includes("facebook")) return "facebook";
  if (raw.includes("twitter") || raw === "x" || raw.includes("x-twitter")) {
    return "x";
  }
  if (raw.includes("github")) return "github";
  if (raw.includes("email") || raw.includes("passwordless")) return "email";

  return raw || "unknown";
}

/**
 * Converts internal provider values into user-friendly names for error messages.
 *
 * @param {string} provider - Raw or normalized provider.
 * @returns {string} User-facing provider name.
 */
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

/**
 * Creates or updates a Web3Auth user in the users table.
 *
 * @param {string} email - Verified email from Web3Auth token.
 * @param {string} walletAddress - XRPL wallet address derived from Web3Auth private key.
 * @param {string} authProvider - Web3Auth provider used for login/signup.
 * @returns {Promise<object>} Created or existing user row.
 */
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

  /**
   * New Web3Auth user:
   * create a base users row first; buyer/seller rows are created later based on role.
   */
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

  /**
   * Same email with different provider is blocked to avoid accidentally linking
   * two different Web3Auth identities to one RecipeChain account.
   */
  if (existingProvider && existingProvider !== normalizedProvider) {
    const providerName = formatAuthProvider(existingProvider);

    throw new Error(
      `This email is already registered with ${providerName}. Please login using ${providerName}.`
    );
  }

  /**
   * Existing same-provider account:
   * only backfill missing fields so we do not overwrite existing stable identity data.
   */
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
/**
 * Updates user role by email.
 *
 * @param {string} email - User email.
 * @param {string} role - Selected app role.
 * @returns {Promise<object>} Updated user row.
 */
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

/**
 * Updates user role by user_id.
 *
 * @param {string} userId - User ID.
 * @param {string} role - Selected app role.
 * @returns {Promise<object>} Updated user row.
 */
export const setUserRoleByUserIdModel = async (userId, role) => {
  const admin = requireAdminClient();

  /**
   * user_id is preferred after login because it comes from the verified session,
   * not from editable frontend input.
   */
  const { data, error } = await admin
    .from("users")
    .update({ role: String(role || "").trim().toLowerCase() })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Fetches current session user by user_id.
 *
 * @param {string} userId - User ID from verified session.
 * @returns {Promise<object>} User row.
 */
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

/**
 * Ensures a buyer profile row exists for the given user.
 *
 * @param {string} userId - User ID.
 * @param {string} email - User email used for fallback display name.
 * @returns {Promise<object>} Existing or created buyer row.
 */
export const ensureBuyerRowModel = async (userId, email) => {
  const admin = requireAdminClient();

  const { data: existingBuyer, error: findError } = await admin
    .from("buyers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  /**
   * If the buyer row already exists, keep it unchanged.
   * This prevents resetting profile data during repeated login/session sync.
   */
  if (existingBuyer) {
    return existingBuyer;
  }

  const displayName = getEmailPrefix(email);

  /**
   * New buyer profiles start with safe defaults so buyer profile pages
   * can render immediately after role selection.
   */
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

/**
 * Ensures a seller profile row exists for the given user.
 *
 * @param {string} userId - User ID.
 * @returns {Promise<object>} Existing or created seller row.
 */
export const ensureSellerRowModel = async (userId) => {
  const admin = requireAdminClient();

  const { data: existingSeller, error: findError } = await admin
    .from("sellers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  /**
   * Existing seller rows should not be recreated because they may already
   * contain KYC status, rejection details, or document metadata.
   */
  if (existingSeller) return existingSeller;

  /**
   * Seller starts with null verification status until KYC is submitted.
   * The frontend KYC page uses this state to show the form.
   */
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