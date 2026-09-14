// src/controllers/authController.js

import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";
import userService from "../services/userService.js";

/**
 * Logs in an admin using Supabase Auth and confirms the user has admin role.
 *
 * @param {import("express").Request} req - Express request containing email and password.
 * @param {import("express").Response} res - Express response used to return login result.
 * @returns {Promise<void>}
 */
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("Login attempt for:", email);

    // 1. Supabase Auth Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({  //check if email and password are in the system
      email: email,
      password: password,
    });

    if (authError) {
      return res.status(401).json({ message: "Email or Password wrong" });
    }

    const userId = authData.user.id;

    // Supabase Auth confirms identity, but the users table confirms the app-level role.
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return res.status(403).json({ message: "You are not an Admin" });
    }

    // Admin profile data is stored separately from the shared users table.
    const { data: profileData, error: profileError } = await supabase
      .from("admins")
      .select("username")
      .eq("admin_id", userId)
      .single();

    if (profileError || !profileData) {
      return res.status(500).json({
        message: "Admin profile data not found",
        supabaseError: profileError?.message,
      });
    }

    return res.status(200).json({
      message: "Admin Login successful!",
      token: authData.session.access_token,
      user: {
        id: userId,
        email: authData.user.email,
        username: profileData.username,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error("adminLogin error:", error);
    return res.status(500).json({ message: "Server Error occurred" });
  }
};

/**
 * Creates a signed app session token for RecipeChain.
 *
 * @param {object} payload - User data stored inside the session token.
 * @returns {string} Signed JWT session token.
 */
const makeSessionToken = (payload) => {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing SESSION_SECRET");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

/**
 * Stores the RecipeChain session token in an HTTP-only cookie.
 *
 * @param {import("express").Response} res - Express response used to set cookie.
 * @param {string} token - Signed session token.
 * @returns {void}
 */
const setSessionCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("rc_session", token, {
    // httpOnly protects the session from being read directly by frontend JavaScript.
    httpOnly: true,

    // In production cross-site (e.g. Vercel -> Render), sameSite must be "none" with secure: true
    sameSite: isProduction ? (process.env.COOKIE_SAME_SITE || "none") : "lax",

    // Keep false for local development HTTP. Use true in production with HTTPS.
    secure: isProduction,

    path: "/",

    // Session lifetime matches the JWT expiry period.
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/**
 * Syncs a Web3Auth-authenticated user with the RecipeChain database.
 *
 * @param {import("express").Request} req - Express request with verified Web3Auth user data.
 * @param {import("express").Response} res - Express response used to return synced user.
 * @returns {Promise<void>}
 */
export const syncWeb3AuthUser = async (req, res) => {
  try {
    /**
     * req.web3auth should be attached by Web3Auth verification middleware.
     * This controller trusts it only after middleware has already verified the token.
     */
    const email = req.web3auth?.email;

    const authProvider =
      req.web3auth?.authConnection ||
      req.web3auth?.groupedAuthConnectionId ||
      "unknown";

    const name =
      req.web3auth?.name ||
      req.web3auth?.username ||
      req.web3auth?.userName ||
      "";

    const profileImage =
      req.web3auth?.picture ||
      req.web3auth?.profileImage ||
      req.web3auth?.profile_image ||
      "";

    const { walletAddress } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "Email missing in Web3Auth token.",
      });
    }

    const normalizedEmail = email.toLowerCase();

    /**
     * This service handles database-level user creation/update logic.
     * Keeping it in the service layer keeps the controller focused on HTTP flow.
     */
    const user = await userService.syncWeb3AuthUser(
      normalizedEmail,
      walletAddress,
      authProvider
    );

    /**
     * Buyer identity is hydrated from Web3Auth so the profile has basic display data
     * even before the buyer manually edits their profile.
     */
    await userService.hydrateBuyerIdentityFromWeb3Auth({
      userId: user.user_id,
      email: normalizedEmail,
      name,
      profileImage,
    });

    const sessionToken = makeSessionToken({
      user_id: user.user_id,
      email: user.email,
      role: user.role ?? null,
    });

    setSessionCookie(res, sessionToken);

    return res.json({
      ok: true,
      user,
    });
  } catch (error) {
    console.error("syncWeb3AuthUser error:", error);

    const message = error?.message || "Server error";

    /**
     * Provider mismatch should be shown as a user-fixable conflict,
     * not as a generic server failure.
     */
    if (message.includes("already registered with")) {
      return res.status(409).json({ ok: false, message });
    }

    return res.status(500).json({ ok: false, message });
  }
};

/**
 * Clears the RecipeChain session cookie.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response used to clear cookie.
 * @returns {Promise<void>}
 */
export const logout = async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("rc_session", {
    path: "/",
    sameSite: isProduction ? (process.env.COOKIE_SAME_SITE || "none") : "lax",
    secure: isProduction,
  });

  return res.json({
    ok: true,
    message: "Logged out",
  });
};