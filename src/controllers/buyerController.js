// src/controllers/buyerController.js
import { supabase } from '../config/supabase.js';
import crypto from 'crypto'; 

// 1. CREATE: Manually add a buyer for testing
export const createBuyer = async (req, res) => {
  // REMOVED 'password' from here!
  const { email, wallet_address, display_name, bio } = req.body; 
  const testUserId = crypto.randomUUID(); 

  try {
    const { error: userError } = await supabase.from('users').insert([{ 
      user_id: testUserId, 
      email: email, 
      // REMOVED 'password' from here too!
      wallet_address: wallet_address, 
      role: 'buyer' 
    }]);
    
    if (userError) throw userError;

    const { error: buyerError } = await supabase.from('buyers').insert([{ 
      user_id: testUserId, 
      display_name: display_name || 'New Buyer', 
      bio: bio || '',
      total_purchases: 0,
      total_spent_xrp: 0,
      account_balance: 0 
    }]);

    if (buyerError) throw buyerError;

    return res.status(201).json({ 
      success: true, 
      message: "Test buyer created successfully", 
      data: { user_id: testUserId, email, display_name } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// 2. READ: Get all buyers (Two-Step Fetch)
export const getAllBuyers = async (req, res) => {
  try {
    // Step A: Get all buyers including the new account_balance column
    const { data: buyers, error: buyerError } = await supabase
        .from('buyers')
        .select('user_id, display_name, total_purchases, total_spent_xrp, bio, profile_picture, account_balance');
        
    if (buyerError) throw buyerError;

    if (!buyers || buyers.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Step B: Get matching user data
    const buyerIds = buyers.map(b => b.user_id);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('user_id, email, wallet_address')
      .in('user_id', buyerIds);
      
    if (userError) throw userError;

    // Step C: Combine them perfectly
    const combinedData = buyers.map(buyer => {
      const matchingUser = users.find(u => u.user_id === buyer.user_id);
      return {
        user_id: buyer.user_id,
        display_name: buyer.display_name,
        total_purchases: buyer.total_purchases,
        total_spent_xrp: buyer.total_spent_xrp,
        account_balance: buyer.account_balance, // <--- Pulled from buyers table
        bio: buyer.bio,
        profile_picture: buyer.profile_picture,
        users: matchingUser ? {
          email: matchingUser.email,
          wallet_address: matchingUser.wallet_address
        } : null
      };
    });

    return res.status(200).json({ success: true, data: combinedData });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// 3. READ: Get a single buyer by ID
export const getBuyerById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: buyerData, error: buyerError } = await supabase
      .from('buyers')
      .select('user_id, display_name, total_purchases, total_spent_xrp, bio, profile_picture, account_balance')
      .eq('user_id', id)
      .single();

    if (buyerError) throw buyerError;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, wallet_address')
      .eq('user_id', id)
      .single();

    if (userError) throw userError;

    const combinedData = {
      ...buyerData,
      users: userData
    };

    return res.status(200).json({ success: true, data: combinedData });
  } catch (error) {
    return res.status(404).json({ success: false, message: "Buyer not found" });
  }
};

// 4. UPDATE: Update a buyer's profile
export const updateBuyer = async (req, res) => {
  const { id } = req.params;
  const { display_name, bio, profile_picture } = req.body; 

  try {
    const { data, error } = await supabase
      .from('buyers')
      .update({ display_name, bio, profile_picture })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, message: "Buyer updated", data });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// 5. DELETE: Remove a buyer account permanently
export const deleteBuyer = async (req, res) => {
  const { id } = req.params;
  try {
    const { error: buyerError } = await supabase.from('buyers').delete().eq('user_id', id);
    if (buyerError) throw buyerError;

    const { error: userError } = await supabase.from('users').delete().eq('user_id', id);
    if (userError) throw userError;

    return res.status(200).json({ success: true, message: "Buyer deleted permanently" });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};