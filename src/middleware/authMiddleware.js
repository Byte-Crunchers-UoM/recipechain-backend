import { supabase } from "../config/supabase.js";

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
  let token;

  /**
   * This middleware expects the frontend to send the Supabase access token
   * in the Authorization header using the Bearer token format.
   */
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      /**
       * Supabase verifies the token and returns the authenticated user.
       * This avoids manually decoding or trusting the token on our own.
       */
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      /**
       * Attach the verified Supabase user to req.user so later controllers
       * can identify who is making the request.
       */
      req.user = user;

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);

      return res.status(401).json({
        message: "Token verification failed",
      });
    }
  }

  /**
   * If no Bearer token was provided, the route should not continue.
   */
  if (!token) {
    return res.status(401).json({
      message: "Token not found, please login",
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
  let token;

  /**
   * Admin routes also require a valid Supabase access token first.
   * Role checking happens only after the token is verified.
   */
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      /**
       * First verify the token with Supabase Auth.
       * A valid token proves the user is logged in.
       */
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      /**
       * Supabase Auth confirms identity, but our users table confirms
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
       * Attach both the verified user and admin role so protected admin
       * controllers can safely use them if needed.
       */
      req.user = user;
      req.adminRole = profileData.role;

      next();
    } catch (error) {
      console.error("Admin Middleware Error:", error);

      return res.status(401).json({
        message: "Token verification failed",
      });
    }
  }

  /**
   * If no Bearer token was provided, the admin route should not continue.
   */
  if (!token) {
    return res.status(401).json({
      message: "Token not found, please login",
    });
  }
};