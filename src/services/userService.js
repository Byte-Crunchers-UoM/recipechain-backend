// src/services/userService.js

import {
  // ===== Existing CRUD (friend)
  createUserModel,
  getUserByIdModel,
  getUserByEmailModel,
  getAllUsersModel,
  updateUserModel,
  deleteUserModel,

  // ===== Web3Auth + XRPL
  upsertWeb3AuthUserModel,
  setUserRoleModel,
  ensureBuyerRowModel,

  // ===== BEST WAY (session-cookie flow)
  getUserByUserIdModel,
  setUserRoleByUserIdModel,
} from "../models/userModel.js";

class UserService {
  // =========================
  // Helpers
  // =========================

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidUsername(username) {
    return username && username.trim().length >= 3;
  }

  // =========================
  // Existing CRUD (Friend)
  // =========================

  async createUser(username, email) {
    if (!this.isValidUsername(username)) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }

    const existingUser = await getUserByEmailModel(email.toLowerCase());
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    return await createUserModel(username.trim(), email.toLowerCase());
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
    if (!id) throw new Error("Invalid user ID");

    if (!this.isValidUsername(username)) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }

    const existingUser = await getUserByIdModel(id);
    if (!existingUser) return null;

    const userWithEmail = await getUserByEmailModel(email.toLowerCase());
    if (
      userWithEmail &&
      userWithEmail.user_id !== id
    ) {
      throw new Error("Email is already taken by another user");
    }

    return await updateUserModel(id, username.trim(), email.toLowerCase());
  }

  async deleteUser(id) {
    if (!id) throw new Error("Invalid user ID");

    const existingUser = await getUserByIdModel(id);
    if (!existingUser) throw new Error("User not found");

    await deleteUserModel(id);
    return { message: "User deleted successfully" };
  }

  // =========================
  // Web3Auth + XRPL (idToken flow)
  // =========================

  async syncWeb3AuthUser(email, walletAddress) {
    if (!email) {
      throw new Error(
        "Email missing in Web3Auth token. Enable email return in Web3Auth settings."
      );
    }

    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format in Web3Auth token");
    }

    if (!walletAddress || typeof walletAddress !== "string") {
      throw new Error("walletAddress is required");
    }

    return await upsertWeb3AuthUserModel(
      email.toLowerCase(),
      walletAddress
    );
  }

  /**
   * ⚠️ Legacy token-based role setter
   * (Used only if you still support idToken-based /users/role)
   */
  async setUserRole(email, role) {
    if (!email) throw new Error("Email missing in session/token");
    if (!this.isValidEmail(email)) throw new Error("Invalid email format");

    if (role !== "buyer" && role !== "seller") {
      throw new Error("Role must be buyer or seller");
    }

    const updatedUser = await setUserRoleModel(email.toLowerCase(), role);

    if (role === "buyer") {
      await ensureBuyerRowModel(
        updatedUser.user_id,
        email.toLowerCase()
      );
    }

    return updatedUser;
  }

  // =========================
  // ✅ BEST WAY (Session-cookie flow)
  // =========================

  /**
   * Used by: GET /api/me
   */
  async getUserByUserId(userId) {
    if (!userId) throw new Error("Missing user_id in session");
    return await getUserByUserIdModel(userId);
  }

  /**
   * Used by: POST /api/users/role (requireSession)
   */
  async setUserRoleByUserId(userId, email, role) {
    if (!userId) throw new Error("Missing user_id in session");
    if (!email) throw new Error("Missing email in session");

    if (role !== "buyer" && role !== "seller") {
      throw new Error("Role must be buyer or seller");
    }

    const updatedUser = await setUserRoleByUserIdModel(userId, role);

    if (role === "buyer") {
      await ensureBuyerRowModel(
        updatedUser.user_id,
        email.toLowerCase()
      );
    }

    return updatedUser;
  }
}

export default new UserService();