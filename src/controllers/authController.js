// src/controllers/authController.js

import { supabase } from '../config/supabase.js';//backend connect with supabase

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("Login attempt for:", email);

    // 1. Supabase Auth Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({   //check email and password are correct 
      email: email,
      password: password,
    });

    if (authError) {
      return res.status(401).json({ message: "Email or Password wrong" });
    }

    // 2. Check Role in users table
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profileData) {
      return res.status(500).json({ message: "User Profile data not found" });
    }

    // 3. Admin Check
    if (profileData.role !== 'admin') {
      return res.status(403).json({ message: "You are not a Admin" });
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