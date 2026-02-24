import userService from "../services/userService.js";

const sendResponse = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({ success, message, data });
};

// Keep your CRUD exports so userRoutes won't crash
export const createUser = async (req, res, next) => {
  try {
    const { username, email } = req.body;
    const newUser = await userService.createUser(username, email);
    return sendResponse(res, 201, true, "User created successfully", newUser);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);
    if (!user) return sendResponse(res, 404, false, "User not found");
    return sendResponse(res, 200, true, "User retrieved successfully", user);
  } catch (err) {
    next(err);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    return sendResponse(res, 200, true, "Users retrieved successfully", users);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body;
    const updatedUser = await userService.updateUser(id, username, email);
    if (!updatedUser) return sendResponse(res, 404, false, "User not found");
    return sendResponse(res, 200, true, "User updated successfully", updatedUser);
  } catch (err) {
    next(err);
  }
};

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
 * GET /api/me
 * Middleware: requireSession
 */
export const getMe = async (req, res) => {
  try {
    const userId = req.session?.user_id;
    if (!userId) return sendResponse(res, 401, false, "No session user_id found");

    const user = await userService.getUserByUserId(userId);
    return sendResponse(res, 200, true, "User loaded successfully", user);
  } catch (e) {
    console.error("getMe error:", e);
    return sendResponse(res, 500, false, e?.message || "Failed to load user");
  }
};

/**
 * POST /api/users/role
 * Middleware: requireSession
 */
export const setUserRole = async (req, res) => {
  try {
    const userId = req.session?.user_id;
    const email = req.session?.email;
    const { role } = req.body;

    if (!userId || !email) {
      return sendResponse(res, 401, false, "Missing session. Please login again.");
    }

    const updatedUser = await userService.setUserRoleByUserId(userId, email, role);
    return sendResponse(res, 200, true, "User role updated successfully", updatedUser);
  } catch (e) {
    console.error("setUserRole error:", e);
    return sendResponse(res, 400, false, e?.message || "Role update failed");
  }
};