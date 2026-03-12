import { supabaseAdmin } from "../config/supabase.js";
import sellerModel from "../models/sellerModel.js";

const selectSellerRole = async ({ userId }) => {
  const existingSeller = await sellerModel.findSellerByUserId(userId);

  if (existingSeller) {
    return existingSeller;
  }

  const newSeller = await sellerModel.createSeller({
    user_id: userId,
  });

  return newSeller;
};

const submitKyc = async ({ userId, body, file }) => {
  const {
    fullName,
    dateOfBirth,
    nationality,
    address,
    phoneNo,
    confirmAccuracy,
    agreeTerms,
  } = body;

  if (!fullName || !dateOfBirth || !nationality || !address || !phoneNo) {
    throw new Error("All required fields must be filled");
  }

  if (!file) {
    throw new Error("Government-issued ID is required");
  }

  if (confirmAccuracy !== "true" || agreeTerms !== "true") {
    throw new Error("You must agree to the declarations");
  }

  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found. Please select seller role first.");
  }

  const safeFileName = `${Date.now()}-${file.originalname}`;
  const filePath = `${userId}/${safeFileName}`;

  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from("seller-kyc")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const updatedSeller = await sellerModel.updateSellerByUserId(userId, {
    full_name: fullName,
    date_of_birth: dateOfBirth,
    nationality,
    address,
    phone_no: phoneNo,
    id_photo_path: filePath,
    verification_status: "pending",
    verification_submitted_at: new Date().toISOString(),
    verified_at: null,
    rejection_reason: null,
  });

  return updatedSeller;
};

const getKycStatus = async (userId) => {
  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found");
  }

  return await sellerModel.getKycStatusByUserId(userId);
};

export default {
  selectSellerRole,
  submitKyc,
  getKycStatus,
};