import { supabase } from '../config/supabase.js';
import crypto from 'crypto'; 

// 1. CREATE: Add a new seller
export const createSeller = async (req, res) => {
  const { 
    email, wallet_address, full_name, nationality, address, 
    nic_no, phone_no, id_document_front_url, id_document_back_url, 
    bio, display_name, experience, profile_photo, social_links,status, rejection_reason,
  } = req.body; 

  const testUserId = crypto.randomUUID(); 

  try {
    const { error: userError } = await supabase.from('users').insert([{ 
      user_id: testUserId, 
      email: email, 
      wallet_address: wallet_address, 
      role: 'seller' 
    }]);

    
    
    if (userError) throw userError;

    const { error: sellerError } = await supabase.from('sellers').insert([{ 
      user_id: testUserId,
      verification_status: 'pending', // Matches your DB column name
      full_name: full_name || '',
      nationality: nationality || '',
      address: address || '',
      nic_no: nic_no || '',
      phone_no: phone_no || '',
      id_document_front_url: id_document_front_url || '',
      id_document_back_url: id_document_back_url || '',
      bio: bio || '',
      display_name: display_name || 'New Seller',
      experience: experience || '',
      profile_photo: profile_photo || '',
      social_links: social_links || null,
      total_recipes: 0,
      active_recipes: 0,
      total_sales: 0,
      earnings_xrp: 0, // Matches your DB screenshot
      rating: 0,
      account_balance: 0,
      
    }]);

    if (sellerError) throw sellerError;

    return res.status(201).json({ 
      success: true, 
      message: "Seller created successfully and is pending verification", 
      data: { user_id: testUserId, email, display_name, status: 'pending' } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// 2. READ: Get all sellers (Wildcard select includes all new columns)
export const getAllSellers = async (req, res) => {
  try {
    const { data: sellers, error: sellerError } = await supabase
        .from('sellers')
        .select('*');
        
    if (sellerError) throw sellerError;

    const sellerIds = sellers.map(s => s.user_id);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('user_id, email, wallet_address')
      .in('user_id', sellerIds);
      
    if (userError) throw userError;

    const combinedData = sellers.map(seller => {
      const matchingUser = users.find(u => u.user_id === seller.user_id);
      return {
        ...seller, 
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

// 3. READ: Get a single seller by ID
export const getSellerById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('*')
      .eq('user_id', id)
      .single();

    if (sellerError) throw sellerError;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, wallet_address')
      .eq('user_id', id)
      .single();

    if (userError) throw userError;

    return res.status(200).json({ 
      success: true, 
      data: { ...sellerData, users: userData } 
    });
  } catch (error) {
    return res.status(404).json({ success: false, message: "Seller not found" });
  }
};


export const verifySeller = async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason, kyc_approval_page_seen } = req.body;

  try {
    // Normalize status to lowercase to ensure the 'if' check works
    const normalizedStatus = status ? status.toLowerCase() : '';

    const { data, error } = await supabase
      .from('sellers')
      .update({ 
        verification_status: normalizedStatus,
        // CRITICAL: Only set to null if status is 'approved'
        // If it's 'rejected', we take the reason sent from the frontend
        rejection_reason: normalizedStatus === 'rejected' ? rejection_reason : null,
        verified_at: normalizedStatus === 'approved' ? new Date().toISOString() : null,
        kyc_approval_page_seen: kyc_approval_page_seen ?? false
      })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    
    return res.status(200).json({ 
      success: true, 
      message: `Seller status updated to ${normalizedStatus}`, 
      data 
    });
  } catch (error) {
    console.error("Update Error:", error.message);
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// ... keep your existing updateSeller and deleteSeller functions here ...

// 5. DELETE: Remove a seller account permanently
export const deleteSeller = async (req, res) => {
  const { id } = req.params;
  try {
    const { error: sellerError } = await supabase.from('sellers').delete().eq('user_id', id);
    if (sellerError) throw sellerError;

    const { error: userError } = await supabase.from('users').delete().eq('user_id', id);
    if (userError) throw userError;

    return res.status(200).json({ success: true, message: "Seller deleted permanently" });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

// Also make sure updateSeller is there if your routes file needs it!
export const updateSeller = async (req, res) => {
  const { id } = req.params;
  const { 
    display_name, bio, profile_photo, full_name, 
    nationality, address, phone_no, experience, social_links 
  } = req.body; 

  try {
    const { data, error } = await supabase
      .from('sellers')
      .update({ 
        display_name, bio, profile_photo, full_name, 
        nationality, address, phone_no, experience, social_links 
      })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, message: "Seller profile updated", data });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};