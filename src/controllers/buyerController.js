import { supabase } from '../config/supabase.js';
import crypto from 'crypto'; 

// 1. CREATE: Manually add a buyer for testing
export const createBuyer = async (req, res) => {
  const { email, wallet_address, display_name, bio } = req.body; 
  const testUserId = crypto.randomUUID(); 

  try {
    const { error: userError } = await supabase.from('users').insert([{ 
      user_id: testUserId, 
      email: email, 
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
      account_balance: 0,
      status: 'active' // Default status
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
    const { data: buyers, error: buyerError } = await supabase
        .from('buyers')
        .select('user_id, display_name, status, total_purchases, total_spent_xrp, bio, profile_picture, account_balance');
        
    if (buyerError) throw buyerError;

    if (!buyers || buyers.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const buyerIds = buyers.map(b => b.user_id);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('user_id, email, wallet_address')
      .in('user_id', buyerIds);
      
    if (userError) throw userError;

    const combinedData = buyers.map(buyer => {
      const matchingUser = users.find(u => u.user_id === buyer.user_id);
      return {
        ...buyer,
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
    // ADDED 'status' here so the profile page can see if they are blocked
    const { data: buyerData, error: buyerError } = await supabase
      .from('buyers')
      .select('user_id, display_name, status, total_purchases, total_spent_xrp, bio, profile_picture, account_balance')
      .eq('user_id', id)
      .single();

      

    if (buyerError) {
      
      throw buyerError;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, wallet_address')
      .eq('user_id', id)
      .single();

    if (userError) throw userError;

    return res.status(200).json({ 
      success: true, 
      data: { ...buyerData, users: userData } 
    });
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

// --- NEW: UPDATE STATUS (Block/Unblock) ---
export const updateBuyerStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expecting 'blocked' or 'active'

  try {
    const { data, error } = await supabase
      .from('buyers')
      .update({ status: status })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Buyer not found");

    return res.status(200).json({ 
      success: true, 
      message: `Buyer status changed to ${status}`,
      data: data[0]
    });
  } catch (error) {
    console.error("DEBUG ERROR:", error);
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