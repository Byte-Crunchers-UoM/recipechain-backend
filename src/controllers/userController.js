import userService from "../services/userService.js";

/**
 * Sends a consistent JSON response for standard user controller APIs.
 *
 * @param {import("express").Response} res - Express response object.
 * @param {number} statusCode - HTTP status code.
 * @param {boolean} success - Whether the request succeeded.
 * @param {string} message - Response message for frontend/user feedback.
 * @param {unknown} data - Optional response data.
 * @returns {void}
 */
const sendResponse = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({ success, message, data });
};

/**
 * Creates a new user using username and email.
 *
 * @param {import("express").Request} req - Request body contains username and email.
 * @param {import("express").Response} res - Response used to return created user.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const createUser = async (req, res, next) => {
  try {
    const { username, email } = req.body;

    // User creation rules are kept in the service layer to keep the controller focused on HTTP flow.
    const newUser = await userService.createUser(username, email);

    return sendResponse(res, 201, true, "User created successfully", newUser);
  } catch (err) {
    next(err);
  }
};

/**
 * Returns one user by route parameter ID.
 *
 * @param {import("express").Request} req - Request params contain user ID.
 * @param {import("express").Response} res - Response used to return user data.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await userService.getUserById(id);

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    return sendResponse(res, 200, true, "User retrieved successfully", user);
  } catch (err) {
    next(err);
  }
};

/**
 * Returns all users in the system.
 *
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Response used to return users list.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();

    // Returning an empty array keeps frontend list rendering simple and safe.
    if (!users || users.length === 0) {
      return sendResponse(res, 200, true, "No users found", []);
    }

    return sendResponse(res, 200, true, "Users retrieved successfully", users);
  } catch (err) {
    next(err);
  }
};

/**
 * Updates a user by route parameter ID.
 *
 * @param {import("express").Request} req - Request params contain user ID and body contains username/email.
 * @param {import("express").Response} res - Response used to return updated user.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body;

    const updatedUser = await userService.updateUser(id, username, email);

    if (!updatedUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    return sendResponse(
      res,
      200,
      true,
      "User updated successfully",
      updatedUser
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Deletes a user by route parameter ID.
 *
 * @param {import("express").Request} req - Request params contain user ID.
 * @param {import("express").Response} res - Response used to return delete status.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    await userService.deleteUser(id);

    return sendResponse(res, 200, true, "User deleted successfully");
  } catch (err) {
    next(err);
  }
};

/**
 * Returns the currently logged-in user.
 *
 * @param {import("express").Request} req - Request should contain session user data from auth middleware.
 * @param {import("express").Response} res - Response used to return current user.
 * @returns {Promise<void>}
 */
export const getMe = async (req, res) => {
  try {
    /**
     * Some routes may use req.session and others may use req.user.
     * Supporting both keeps this controller compatible with existing auth middleware.
     */
    const userId = req.session?.user_id || req.user?.user_id;

    if (!userId) {
      return sendResponse(res, 401, false, "No session user_id found");
    }

    const user = await userService.getUserByUserId(userId);

    return sendResponse(res, 200, true, "User loaded successfully", user);
  } catch (e) {
    console.error("getMe error:", e);

    return sendResponse(res, 500, false, e?.message || "Failed to load user");
  }
};

/**
 * Sets the role for the currently logged-in user.
 *
 * @param {import("express").Request} req - Request body contains selected role.
 * @param {import("express").Response} res - Response used to return updated user.
 * @returns {Promise<void>}
 */
export const setUserRole = async (req, res) => {
  try {
    /**
     * Role selection happens after login/signup, so the user must already
     * have a valid session before assigning buyer/seller role.
     */
    const userId = req.session?.user_id || req.user?.user_id;
    const email = req.session?.email || req.user?.email;
    const { role } = req.body;

    if (!userId || !email) {
      return sendResponse(
        res,
        401,
        false,
        "Missing session. Please login again."
      );
    }

    const updatedUser = await userService.setUserRoleByUserId(
      userId,
      email,
      role
    );

    return sendResponse(
      res,
      200,
      true,
      "User role updated successfully",
      updatedUser
    );
  } catch (e) {
    console.error("setUserRole error:", e);

    return sendResponse(res, 400, false, e?.message || "Role update failed");
  }
};

/**
 * Requests account deletion for the currently logged-in user.
 *
 * @param {import("express").Request} req - Request should contain session user data from auth middleware.
 * @param {import("express").Response} res - Response used to return deletion request status.
 * @returns {Promise<void>}
 */
export const requestMyAccountDeletion = async (req, res) => {
  try {
    const userId = req.session?.user_id || req.user?.user_id;

    if (!userId) {
      return sendResponse(
        res,
        401,
        false,
        "Missing session. Please login again."
      );
    }

    /**
     * This is a soft/request-based deletion flow.
     * The service can mark the account for review instead of deleting data immediately.
     */
    const updatedUser = await userService.requestAccountDeletion(userId);

    return res.status(200).json({
      ok: true,
      message: "Account deletion request submitted successfully.",
      data: updatedUser,
    });
  } catch (e) {
    console.error("requestMyAccountDeletion error:", e);

    return res.status(400).json({
      ok: false,
      message: e?.message || "Failed to request account deletion",
    });
  }
};

/**
 * Permanently deletes the currently logged-in user's account.
 *
 * @param {import("express").Request} req - Request should contain session user data from auth middleware.
 * @param {import("express").Response} res - Response used to return permanent deletion status.
 * @returns {Promise<void>}
 */
export const deleteMyAccountPermanently = async (req, res) => {
  try {
    const userId = req.session?.user_id || req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Missing session. Please login again.",
      });
    }

    /**
     * Permanent deletion should be handled in the service layer because it may
     * need to remove related buyer/seller/profile records in the correct order.
     */
    await userService.deleteMyAccountPermanently(userId);

    // Clear the session cookie so the deleted user cannot continue using the old session.
    res.clearCookie("rc_session", { path: "/" });

    return res.status(200).json({
      ok: true,
      message: "Account deleted permanently.",
    });
  } catch (e) {
    console.error("deleteMyAccountPermanently error:", e);

    return res.status(400).json({
      ok: false,
      message: e?.message || "Failed to delete account permanently",
    });
  }
};

/**
 * Returns a chef's public profile (seller info + social links).
 *
 * @param {import("express").Request} req - Request params contain chef/seller ID.
 * @param {import("express").Response} res - Response used to return chef profile.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const getChefProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const profile = await userService.getChefProfile(id);

    return sendResponse(res, 200, true, "Chef profile retrieved successfully", profile);
  } catch (err) {
    next(err);
  }
};

/**
 * Follows a chef on behalf of a buyer by incrementing the chef's follower count.
 *
 * @param {import("express").Request} req - Request params contain chef ID, body contains buyerId.
 * @param {import("express").Response} res - Response used to return updated seller.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
export const followUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { buyerId } = req.body;

    if (!buyerId) {
      return sendResponse(res, 400, false, "Buyer ID is required");
    }

    const updatedSeller = await userService.incrementFollowers(id);

    return sendResponse(res, 200, true, "Successfully followed chef", updatedSeller);
  } catch (err) {
    next(err);
  }
};
