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

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      return res.status(401).json({ message: "Email or Password wrong" });
    }

    const userId = authData.user.id;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return res.status(403).json({ message: "You are not an Admin" });
    }

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

const makeSessionToken = (payload) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

const setSessionCookie = (res, token) => {
  res.cookie("rc_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const syncWeb3AuthUser = async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        message: "SUPABASE_SERVICE_ROLE_KEY missing on backend",
      });
    }

    const email = req.web3auth?.email;
    const authProvider =
      req.web3auth?.authConnection ||
      req.web3auth?.groupedAuthConnectionId ||
      "unknown";

    const { walletAddress } = req.body;

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

    const user = await userService.syncWeb3AuthUser(
      email.toLowerCase(),
      walletAddress,
      authProvider
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
    });
  } catch (error) {
    console.error("syncWeb3AuthUser error:", error);

    const message = error?.message || "Server error";

    if (
      message.includes("already registered with") ||
      message.includes("Please login using") ||
      message.includes("Please continue with")
    ) {
      return res.status(409).json({ ok: false, message });
    }

    return res.status(500).json({ ok: false, message });
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  res.clearCookie("rc_session", { path: "/" });
  return res.json({ ok: true, message: "Logged out" });
};