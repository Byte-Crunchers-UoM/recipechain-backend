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