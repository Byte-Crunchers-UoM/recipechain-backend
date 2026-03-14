// src/controllers/authController.js
import jwt from "jsonwebtoken";
import { supabase, supabaseAdmin } from "../config/supabase.js";
import userService from "../services/userService.js";

/**
 * ADMIN LOGIN
 * POST /api/auth/admin-login
 * Body: { email, password }
 */
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("Login attempt for:", email);

    // 1. Supabase Auth Login
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      return res.status(401).json({ message: "Email or Password wrong" });
    }

    const userId = authData.user.id;

    // 2. Check parent 'users' table for admin role
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return res.status(403).json({ message: "You are not an Admin" });
    }

    // 3. Check child 'admins' table for admin username
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

    // 4. Success Response
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

const makeSessionToken = (payload) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

const setSessionCookie = (res, token) => {
  res.cookie("rc_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // true in production HTTPS
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/**
 * POST /api/auth/web3auth/sync
 * Header: Authorization: Bearer <Web3Auth idToken>
 * Body: { walletAddress, mode: "login" | "signup" }
 *
 * Middleware: requireWeb3Auth sets req.web3auth.email
 */
export const syncWeb3AuthUser = async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        message: "SUPABASE_SERVICE_ROLE_KEY missing on backend",
      });
    }

    const email = req.web3auth?.email;
    const { walletAddress, mode } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        message:
          "Email missing in Web3Auth token. Enable email scope in Web3Auth.",
      });
    }

    if (!walletAddress || typeof walletAddress !== "string") {
      return res
        .status(400)
        .json({ ok: false, message: "walletAddress is required" });
    }

    if (mode !== "login" && mode !== "signup") {
      return res
        .status(400)
        .json({ ok: false, message: "mode must be login or signup" });
    }

    const { data: existingUser, error: findErr } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (findErr) throw findErr;

    if (mode === "login" && !existingUser) {
      return res.status(404).json({
        ok: false,
        message: "Account not found. Please sign up first.",
      });
    }

    const user = await userService.syncWeb3AuthUser(
      email.toLowerCase(),
      walletAddress
    );

    const sessionToken = makeSessionToken({
      user_id: user.user_id,
      email: user.email,
      role: user.role ?? null,
    });

    setSessionCookie(res, sessionToken);

    return res.json({
      ok: true,
      user,
      modeResolved: existingUser ? "login" : "signup",
    });
  } catch (error) {
    console.error("syncWeb3AuthUser error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * POST /api/auth/logout
 * Clears rc_session cookie
 */
export const logout = async (req, res) => {
  res.clearCookie("rc_session", { path: "/" });
  return res.json({ ok: true, message: "Logged out" });
};