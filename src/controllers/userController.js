import userService from "../services/userService.js";

const sendResponse = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({ success, message, data });
};

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
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }
    return sendResponse(res, 200, true, "User retrieved successfully", user);
  } catch (err) {
    next(err);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    if (!users || users.length === 0) {
      return sendResponse(res, 200, true, "No users found", []);
    }
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

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    await userService.deleteUser(id);
    return sendResponse(res, 200, true, "User deleted successfully");
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res) => {
  try {
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

export const setUserRole = async (req, res) => {
  try {
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

export const requestMyAccountDeletion = async (req, res) => {
  try {
    const userId = req.session?.user_id || req.user?.user_id;

    if (!userId) {
      return sendResponse(res, 401, false, "Missing session. Please login again.");
    }

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

export const deleteMyAccountPermanently = async (req, res) => {
  try {
    const userId = req.session?.user_id || req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Missing session. Please login again.",
      });
    }

    await userService.deleteMyAccountPermanently(userId);

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