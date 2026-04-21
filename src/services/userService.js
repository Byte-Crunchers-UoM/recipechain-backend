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
} from "../models/userModel.js";

class UserService {
  normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  normalizeUsername(username) {
    return String(username || "").trim();
  }

  normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email || "").trim());
  }

  isValidUsername(username) {
    return String(username || "").trim().length >= 3;
  }

  isValidRole(role) {
    return role === "buyer" || role === "seller";
  }

  getEmailPrefix(email) {
    const safeEmail = String(email || "").trim();
    if (!safeEmail) return "Buyer";
    return safeEmail.split("@")[0] || "Buyer";
  }

  async createUser(username, email) {
    const normalizedUsername = this.normalizeUsername(username);
    const normalizedEmail = this.normalizeEmail(email);

    if (!this.isValidUsername(normalizedUsername)) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    const existingUser = await getUserByEmailModel(normalizedEmail);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    return await createUserModel(normalizedUsername, normalizedEmail);
  }

  async getUserById(id) {
    if (!id) {
      throw new Error("Invalid user ID");
    }

    return await getUserByIdModel(id);
  }

  async getAllUsers() {
    return await getAllUsersModel();
  }

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

    const userWithEmail = await getUserByEmailModel(normalizedEmail);
    if (userWithEmail && userWithEmail.user_id !== id) {
      throw new Error("Email is already taken by another user");
    }

    return await updateUserModel(id, normalizedUsername, normalizedEmail);
  }

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

  async syncWeb3AuthUser(email, walletAddress, authProvider) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedAuthProvider = String(authProvider || "").trim();

    if (!normalizedEmail) {
      throw new Error(
        "Email missing in Web3Auth token. Enable email return in Web3Auth settings."
      );
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format in Web3Auth token");
    }

    if (!walletAddress || typeof walletAddress !== "string") {
      throw new Error("walletAddress is required");
    }

    if (!normalizedAuthProvider) {
      throw new Error("Auth provider is missing");
    }

    return await upsertWeb3AuthUserModel(
      normalizedEmail,
      walletAddress.trim(),
      normalizedAuthProvider
    );
  }

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

    if (!currentDisplayName || currentDisplayName === "New Buyer") {
      updates.display_name = fallbackDisplayName;
    }

    // only auto-fill if the user does not already have a custom/manual profile photo
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

    if (normalizedRole === "buyer") {
      await ensureBuyerRowModel(updatedUser.user_id, normalizedEmail);
    }

    if (normalizedRole === "seller") {
      await ensureSellerRowModel(updatedUser.user_id);
    }

    return updatedUser;
  }

  async getUserByUserId(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await getUserByUserIdModel(userId);
  }

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

    if (normalizedRole === "buyer") {
      await ensureBuyerRowModel(updatedUser.user_id, normalizedEmail);
    }

    if (normalizedRole === "seller") {
      await ensureSellerRowModel(updatedUser.user_id);
    }

    return updatedUser;
  }

  async requestAccountDeletion(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await requestAccountDeletionByUserIdModel(userId);
  }

  async deleteMyAccountPermanently(userId) {
    if (!userId) {
      throw new Error("Missing user_id in session");
    }

    return await deleteMyBuyerAccountPermanentlyByUserIdModel(userId);
  }
}

export default new UserService();