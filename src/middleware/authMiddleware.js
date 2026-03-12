// src/middleware/authMiddleware.js

import { supabase } from "../config/supabase.js";

/*
------------------------------------------
Protect logged-in users (seller/buyer)
------------------------------------------
*/
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      // attach user to request
      req.user = user;

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return res.status(401).json({ message: "Token verification failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Token not found, please login" });
  }
};

/*
------------------------------------------
Protect ADMIN routes
------------------------------------------
*/
export const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      // check role in users table
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData || profileData.role !== "admin") {
        return res.status(403).json({ message: "Admin only route" });
      }

      req.user = user;
      req.adminRole = profileData.role;

      next();
    } catch (error) {
      console.error("Admin Middleware Error:", error);
      return res.status(401).json({ message: "Token verification failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Token not found, please login" });
  }
};