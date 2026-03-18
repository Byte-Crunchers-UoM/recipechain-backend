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

    const userId = authData.user.id;

    // 2. Check the parent 'users' table to confirm the 'admin' role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return res.status(403).json({ message: "You are not an Admin" });
    }

    // 3. Check the child 'admins' table to fetch the username
    const { data: profileData, error: profileError } = await supabase
      .from('admins') 
      .select('username') 
      .eq('admin_id', userId) 
      .single();

    if (profileError || !profileData) {
      return res.status(500).json({ 
          message: "Admin profile data not found", 
          supabaseError: profileError.message 
      });
    }

    // 4. Success Response combining data from both tables
    return res.status(200).json({
      message: "Admin Login successful!",
      token: authData.session.access_token,
      user: {
        id: userId,
        email: authData.user.email,
        username: profileData.username, 
        role: userData.role             
      }
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ message: "Server Error occurred" });
  }
};