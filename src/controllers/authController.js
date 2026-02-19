// src/controllers/authController.js

import { supabase } from '../config/supabase.js';

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("Login attempt for:", email);

    // 1. Supabase Auth Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (authError) {
      return res.status(401).json({ message: "Email or Password wrong" });
    }

    // 2. Check Role in the 'admins' table instead of 'users'
    // We use 'admin_id' because that is what you named your column in the admins table.
    const { data: profileData, error: profileError } = await supabase
      .from('admins') // Changed from 'users'
      .select('role')
      .eq('admin_id', authData.user.id) // Changed 'id' to 'admin_id'
      .single();

    if (profileError || !profileData) {
      return res.status(500).json({ message: "Admin profile data not found" });
    }

    // 3. Admin Check
    if (profileData.role !== 'admin') {
      return res.status(403).json({ message: "You are not an Admin" });
    }

    // 4. Success Response
    return res.status(200).json({
      message: "Admin Login successful!",
      token: authData.session.access_token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: profileData.role
      }
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ message: "Server Error occurred" });
  }
};