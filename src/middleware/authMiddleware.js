// src/middleware/authMiddleware.js

import { supabase } from '../config/supabase.js';

export const protectAdmin = async (req, res, next) => {
  let token;

  // 1. check is header has token (Like asBearer Token)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // "separate token from Bearer <token>" 
      token = req.headers.authorization.split(' ')[1];

      // 2.Token  Verify by supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: "(Not Authorized)" });
      }

      // 3. Check user role
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profileData || profileData.role !== 'admin') {
        return res.status(403).json({ message: " (Admin Only)" });
      }

      // 4. is all correct,add  User details to req 
      req.user = user;
      req.adminRole = profileData.role;
      next();

    } catch (error) {
      console.error("Middleware Error:", error);
      return res.status(401).json({ message: "Token check is failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Token is not found, please Login." });
  }
};