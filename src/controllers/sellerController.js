import { supabase } from '../config/supabase.js';
import crypto from 'crypto'; 

// 1. CREATE: Add a new seller with all profile data
export const createSeller = async (req, res) => {
  // Extracting all the new KYC and profile fields from Postman
  const { 
    email, wallet_address, full_name, nationality, address, 
    Nic_no, phone_no, Id_photo_path, bio, display_name, 
    experince, profile_photo, social_links 
  } = req.body; 

  const testUserId = crypto.randomUUID(); 

  try {
    // Step 1: Create the parent user account
    const { error: userError } = await supabase.from('users').insert([{ 
      user_id: testUserId, 
      email: email, 
      wallet_address: wallet_address, 
      role: 'seller' 
    }]);
    
    if (userError) throw userError;

    // Step 2: Create the child seller profile with all default stats set to 0
    const { error: sellerError } = await supabase.from('sellers').insert([{ 
      user_id: testUserId,
      status: 'pending', // Default status for new sellers
      full_name: full_name || '',
      nationality: nationality || '',
      address: address || '',
      Nic_no: Nic_no || '',
      phone_no: phone_no || '',
      Id_photo_path: Id_photo_path || '',
      bio: bio || '',
      total_recipes: 0,
      active_recipes: 0,
      total_sales: 0,
      earning_xrp: 0,
      rating: 0,
      display_name: display_name || 'New Seller',
      experince: experince || '',
      profile_photo: profile_photo || '',
      social_links: social_links || null,
      account_balance: 0 
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

// 2. READ: Get all sellers
export const getAllSellers = async (req, res) => {
  try {
    // Fetch absolutely every column by using the '*' wildcard
    const { data: sellers, error: sellerError } = await supabase
        .from('sellers')
        .select('*');
        
    if (sellerError) throw sellerError;

    if (!sellers || sellers.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const sellerIds = sellers.map(s => s.user_id);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('user_id, email, wallet_address')
      .in('user_id', sellerIds);
      
    if (userError) throw userError;

    // Combine using the Spread Operator (...seller) to easily include all 20+ columns
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
      .select('*') // Fetch all columns
      .eq('user_id', id)
      .single();

    if (sellerError) throw sellerError;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, wallet_address')
      .eq('user_id', id)
      .single();

    if (userError) throw userError;

    const combinedData = {
      ...sellerData, // Spread all 20+ seller columns
      users: userData
    };

    return res.status(200).json({ success: true, data: combinedData });
  } catch (error) {
    return res.status(404).json({ success: false, message: "Seller not found" });
  }
};

// 4. UPDATE: Update a seller's profile
export const updateSeller = async (req, res) => {
  const { id } = req.params;
  
  // Destructure the fields a seller is allowed to update
  const { 
    display_name, bio, profile_photo, full_name, 
    nationality, address, phone_no, experince, social_links 
  } = req.body; 

  try {
    const { data, error } = await supabase
      .from('sellers')
      .update({ 
        display_name, bio, profile_photo, full_name, 
        nationality, address, phone_no, experince, social_links 
      })
      .eq('user_id', id)
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, message: "Seller profile updated", data });
  } catch (error) {
    return res.status(500).json({ success: false, errorDetails: error.message });
  }
};

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