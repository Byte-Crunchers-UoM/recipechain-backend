// src/middleware/sessionMiddleware.js

import jwt from "jsonwebtoken";

/**
 * Builds a consistent session/user object from the decoded JWT payload.
 *
 * @param {object} payload - Decoded JWT payload.
 * @returns {object} Normalized authenticated user/session data.
 */
const normalizeSessionPayload = (payload) => {
  const normalizedPayload =
    payload && typeof payload === "object" ? payload : {};

  const userId =
    normalizedPayload.user_id ||
    normalizedPayload.id ||
    normalizedPayload.sub ||
    null;

  return {
    ...normalizedPayload,
    user_id: userId,
    email: normalizedPayload.email,
    role: normalizedPayload.role ?? null,
  };
};

/**
 * Requires a valid RecipeChain session cookie before allowing the request to continue.
 *
 * @param {import("express").Request} req - Express request object containing cookies.
 * @param {import("express").Response} res - Express response object used for auth errors.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const requireSession = (req, res, next) => {
  try {
    /**
     * rc_session is the HTTP-only cookie created after Web3Auth login/signup.
     * Frontend JavaScript cannot directly read this cookie, which is safer than localStorage.
     */
    const token = req.cookies?.rc_session;

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    const secret = process.env.SESSION_SECRET;

    if (!secret) {
      /**
       * Missing SESSION_SECRET is a backend configuration issue, not a user login issue.
       * Returning 500 helps identify environment setup problems clearly.
       */
      return res.status(500).json({
        ok: false,
        message: "Missing SESSION_SECRET in backend environment",
      });
    }

    /**
     * jwt.verify checks that the session token was created by this backend
     * and has not been modified or expired.
     */
    const decoded = jwt.verify(token, secret);
    const sessionUser = normalizeSessionPayload(decoded);

    if (!sessionUser.user_id) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    /**
     * Keep req.session for older controller/service code that already depends on it.
     * This avoids breaking existing working APIs during refactoring.
     */
    req.session = sessionUser;

    /**
     * Also expose normalized user data through req.user for newer controller code.
     * This gives the backend one clean shape for authenticated user details.
     */
    req.user = sessionUser;

    return next();
  } catch (error) {
    console.error("requireSession error:", error);

    /**
     * Invalid, expired, or tampered cookies should all be treated as unauthenticated.
     */
    return res.status(401).json({
      ok: false,
      message: "Authenticated user not found in session",
    });
  }
};

/**
 * Reads the session cookie when available, but does not block unauthenticated users.
 *
 * @param {import("express").Request} req - Express request object containing optional cookies.
 * @param {import("express").Response} _res - Unused Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const optionalSession = (req, _res, next) => {
  try {
    /**
     * Optional session is useful for public routes that can behave differently
     * when a user is logged in, without requiring login.
     */
    const token = req.cookies?.rc_session;
    const secret = process.env.SESSION_SECRET;

    if (!token || !secret) {
      req.session = null;
      req.user = null;
      return next();
    }

    /**
     * If the cookie is valid, attach user details just like requireSession().
     * If it is invalid, the catch block will continue as a guest user.
     */
    const decoded = jwt.verify(token, secret);
    const sessionUser = normalizeSessionPayload(decoded);

    if (!sessionUser.user_id) {
      req.session = null;
      req.user = null;
      return next();
    }

    req.session = sessionUser;
    req.user = sessionUser;

    return next();
  } catch {
    /**
     * Optional auth should never break public pages.
     * Invalid sessions are ignored and the request continues as unauthenticated.
     */
    req.session = null;
    req.user = null;
    return next();
  }
};

export default {
  requireSession,
  optionalSession,
};