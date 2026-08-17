// src/middleware/authMiddleware.js

import { supabase } from "../config/supabase.js";

/**
 * Verifies a Supabase access token from the Authorization header.
 *
 * Expected header:
 * Authorization: Bearer <supabase_access_token>
 *
 * @param {import("express").Request} req - Express request object.
 * @returns {Promise<{ user: object, token: string }>}
 */
const verifySupabaseBearerToken = async (req) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    const error = new Error("Token not found, please login");
    error.statusCode = 401;
    throw error;
  }

  const token = authorization.split(" ")[1];

  if (!token) {
    const error = new Error("Token not found, please login");
    error.statusCode = 401;
    throw error;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    const authError = new Error("Not authorized");
    authError.statusCode = 401;
    throw authError;
  }

  return { user, token };
};

/**
 * Protects routes that require a logged-in user.
 *
 * Expected header:
 * Authorization: Bearer <supabase_access_token>
 *
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 */
export const protect = async (req, res, next) => {
  try {
    const { user, token } = await verifySupabaseBearerToken(req);

    /**
     * Supabase Auth returns `id`, but many controllers in this project
     * use `req.user.user_id`. Keeping both prevents existing controllers
     * from breaking.
     */
    req.user = {
      ...user,
      user_id: user.id,
    };

    req.accessToken = token;

    return next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);

    return res.status(error.statusCode || 401).json({
      message: error.message || "Token verification failed",
    });
  }
};

/**
 * Protects routes that require an authenticated admin user.
 *
 * Expected header:
 * Authorization: Bearer <supabase_access_token>
 *
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 */
export const protectAdmin = async (req, res, next) => {
  try {
    const { user, token } = await verifySupabaseBearerToken(req);

    /**
     * Supabase Auth confirms identity, but the users table confirms
     * the application-level role such as buyer, seller, or admin.
     */
    const { data: profileData, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profileData || profileData.role !== "admin") {
      return res.status(403).json({
        message: "Admin only route",
      });
    }

    /**
     * Keep both `id` and `user_id` so existing controllers can safely use either.
     */
    req.user = {
      ...user,
      user_id: user.id,
    };

    req.accessToken = token;
    req.adminRole = profileData.role;

    return next();
  } catch (error) {
    console.error("Admin Middleware Error:", error);

    return res.status(error.statusCode || 401).json({
      message: error.message || "Token verification failed",
    });
  }
};

export default {
  protect,
  protectAdmin,
};