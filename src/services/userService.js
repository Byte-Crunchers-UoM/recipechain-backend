import { supabaseAdmin } from "../config/supabase.js";
import {
  createUserModel,
  getUserByIdModel,
  getUserByEmailModel,
  getAllUsersModel,
  updateUserModel,
  deleteUserModel,
  upsertWeb3AuthUserModel,
  setUserRoleModel,
  ensureBuyerRowModel,
  ensureSellerRowModel,
  getUserByUserIdModel,
  setUserRoleByUserIdModel,
  requestAccountDeletionByUserIdModel,
  deleteMyBuyerAccountPermanentlyByUserIdModel,
  getChefProfileModel,
  incrementFollowersModel,
} from "../models/userModel.js";

class UserService {
  /**
   * Normalizes email before validation/database queries.
   * This avoids duplicate accounts caused by uppercase letters or extra spaces.
   */
  normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /**
   * Trims username before validation/storage.
   */
  normalizeUsername(username) {
    return String(username || "").trim();
  }

  /**
   * Normalizes role before saving it to the database.
   */
  normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  /**
   * Performs a basic email format check before database operations.
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email || "").trim());
  }

  /**
   * Keeps usernames readable and prevents very short names.
   */
  isValidUsername(username) {
    return String(username || "").trim().length >= 3;
  }

  /**
   * Only buyer and seller roles are allowed from normal user role selection.
   */
  isValidRole(role) {
    return role === "buyer" || role === "seller";
  }

  /**
   * Uses email prefix as a safe fallback display name for new buyer profiles.
   */
  getEmailPrefix(email) {
    const safeEmail = String(email || "").trim();
    if (!safeEmail) return "Buyer";
    return safeEmail.split("@")[0] || "Buyer";
  }

  /**
   * Creates a normal user after validating username, email, and duplicate email.
   */
  async createUser(username, email) {
    const normalizedUsername = this.normalizeUsername(username);
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidUsername(normalizedUsername)) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    /**
     * Duplicate email check is done before insert to return a clear error message.
     */
    const existingUser = await getUserByEmailModel(normalizedEmail);

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    return await createUserModel(normalizedUsername, normalizedEmail);
  }

  /**
   * Gets one user by ID.
   */
  async getUserById(id) {
    if (!id) {
      throw new Error("Invalid user ID");
    }

    return await getUserByIdModel(id);
  }

  /**
   * Gets all users from the model layer.
   */
  async getAllUsers() {
    return await getAllUsersModel();
  }

  /**
   * Updates a user after validating input and checking email ownership.
   */
  async updateUser(id, username, email) {
    if (!id) {
      throw new Error("Invalid user ID");
    }

    const normalizedUsername = this.normalizeUsername(username);
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidUsername(normalizedUsername)) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    const existingUser = await getUserByIdModel(id);

    if (!existingUser) {
      return null;
    }

    /**
     * Prevents changing this user to an email already used by another account.
     */
    const userWithEmail = await getUserByEmailModel(normalizedEmail);

    if (userWithEmail && userWithEmail.user_id !== id) {
      throw new Error("Email is already taken by another user");
    }

    return await updateUserModel(id, normalizedUsername, normalizedEmail);
  }

  /**
   * Deletes a user after confirming the user exists.
   */
  async deleteUser(id) {
    if (!id) {
      throw new Error("Invalid user ID");
    }

    const existingUser = await getUserByIdModel(id);

    if (!existingUser) {
      throw new Error("User not found");
    }

    await deleteUserModel(id);

    return { message: "User deleted successfully" };
  }

  /**
   * Syncs a Web3Auth-authenticated user with the RecipeChain users table.
   *
   * This is used during Web3Auth signup/login.
   */
  async syncWeb3AuthUser(email, walletAddress, authProvider) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedAuthProvider = String(authProvider || "").trim();

    /**
     * Email must come from the verified Web3Auth token, not from editable frontend input.
     */
    if (!normalizedEmail) {
      throw new Error(
        "Email missing in Web3Auth token. Enable email return in Web3Auth settings."
      );
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format in Web3Auth token");
    }

    /**
     * Wallet address is generated on frontend from Web3Auth private key
     * and stored with the user for XRPL transactions.
     */
    if (!walletAddress || typeof walletAddress !== "string") {
      throw new Error("walletAddress is required");
    }

    /**
     * Provider is stored to prevent same-email login using a different Web3Auth provider.
     */
    if (!normalizedAuthProvider) {
      throw new Error("Auth provider is missing");
    }

    return await upsertWeb3AuthUserModel(
      normalizedEmail,
      walletAddress.trim(),
      normalizedAuthProvider
    );
  }

  /**
   * Creates or updates basic buyer profile details using verified Web3Auth identity.
   *
   * This gives buyers a usable profile immediately after Web3Auth signup/login.
   */
  async hydrateBuyerIdentityFromWeb3Auth({
    userId,
    email,
    name,
    profileImage,
  }) {
    if (!supabaseAdmin) {
      throw new Error("Supabase admin client is not configured");
    }

    if (!userId) {
      throw new Error("Missing userId for buyer hydration");
    }

    const cleanName = String(name || "").trim();
    const cleanProfileImage = String(profileImage || "").trim();
    const normalizedEmail = this.normalizeEmail(email);
    const fallbackDisplayName = cleanName || this.getEmailPrefix(normalizedEmail);

    const { data: existingBuyer, error: findError } = await supabaseAdmin
      .from("buyers")
      .select("user_id, display_name, profile_picture")
      .eq("user_id", userId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    /**
     * If buyer row does not exist yet, create it with safe default stats.
     */
    if (!existingBuyer) {
      const { error: insertError } = await supabaseAdmin.from("buyers").insert({
        user_id: userId,
        display_name: fallbackDisplayName,
        bio: "",
        profile_picture: cleanProfileImage || null,
        total_purchases: 0,
        total_spent_xrp: 0,
        account_balance: 0,
      });

      if (insertError) throw insertError;
      return;
    }

    const updates = {};

    const currentDisplayName = String(existingBuyer.display_name || "").trim();
    const currentProfilePicture = String(
      existingBuyer.profile_picture || ""
    ).trim();

    /**
     * Only auto-fill display name when the buyer has not set a meaningful one yet.
     * This avoids overwriting manual profile edits.
     */
    if (!currentDisplayName || currentDisplayName === "New Buyer") {
      updates.display_name = fallbackDisplayName;
    }

    /**
     * Only auto-fill profile photo if the buyer does not already have a custom/manual photo.
     */
    if (!currentProfilePicture && cleanProfileImage) {
      updates.profile_picture = cleanProfileImage;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("buyers")
        .update(updates)
        .eq("user_id", userId);

      if (updateError) throw updateError;
    }
  }

  /**
   * Sets user role by email and ensures the matching buyer/seller row exists.
   */
  async setUserRole(email, role) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedRole = this.normalizeRole(role);

    if (!normalizedEmail) {
      throw new Error("Email missing in session/token");
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    if (!this.isValidRole(normalizedRole)) {
      throw new Error("Role must be buyer or seller");
    }

    const updatedUser = await setUserRoleModel(normalizedEmail, normalizedRole);

    /**
     * Role-specific rows are created immediately so protected pages have data to load.
     */
    if (normalizedRole === "buyer") {
      await ensureBuyerRowModel(updatedUser.user_id, normalizedEmail);
    }

    if (normalizedRole === "seller") {
      await ensureSellerRowModel(updatedUser.user_id);
    }

    return updatedUser;
  }

  /**
   * Gets the current logged-in user using user_id from verified session.
   */
  async getUserByUserId(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await getUserByUserIdModel(userId);
  }

  /**
   * Sets user role by user_id and ensures the matching buyer/seller row exists.
   *
   * This is preferred for session-based flows because user_id comes from verified session.
   */
  async setUserRoleByUserId(userId, email, role) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedRole = this.normalizeRole(role);

    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    if (!normalizedEmail) {
      throw new Error("Missing email in session");
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    if (!this.isValidRole(normalizedRole)) {
      throw new Error("Role must be buyer or seller");
    }

    const updatedUser = await setUserRoleByUserIdModel(userId, normalizedRole);

    /**
     * Creating the role-specific row here prevents 404 errors immediately after role selection.
     */
    if (normalizedRole === "buyer") {
      await ensureBuyerRowModel(updatedUser.user_id, normalizedEmail);
    }

    if (normalizedRole === "seller") {
      await ensureSellerRowModel(updatedUser.user_id);
    }

    return updatedUser;
  }

  /**
   * Requests account deletion for the current logged-in user.
   */
  async requestAccountDeletion(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await requestAccountDeletionByUserIdModel(userId);
  }

  /**
   * Permanently deletes the current buyer account and related buyer data.
   */
  async deleteMyAccountPermanently(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await deleteMyBuyerAccountPermanentlyByUserIdModel(userId);
  }

  async getChefProfile(id) {
    if (!id) {
      throw new Error('Chef ID is required');
    }
    return await getChefProfileModel(id);
  }
  
  async incrementFollowers(id) {
    if (!id) {
      throw new Error('Chef ID is required');
    }
    return await incrementFollowersModel(id);
  }
}

export default new UserService();