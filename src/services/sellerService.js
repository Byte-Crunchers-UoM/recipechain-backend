import sellerModel from "../models/sellerModel.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

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
    nicNo,
    confirmAccuracy,
    agreeTerms,
  } = body;

  const cleanedFullName = fullName?.trim();
  const cleanedNationality = nationality?.trim();
  const cleanedAddress = address?.trim();
  const cleanedPhoneNo = phoneNo?.trim();
  const cleanedNicNo = nicNo?.trim();

  if (
    !cleanedFullName ||
    !dateOfBirth ||
    !cleanedNationality ||
    !cleanedAddress ||
    !cleanedPhoneNo ||
    !cleanedNicNo
  ) {
    throw new Error("All required fields must be filled");
  }

  if (!file) {
    throw new Error("Government-issued ID is required");
  }

  if (confirmAccuracy !== "true" || agreeTerms !== "true") {
    throw new Error("You must agree to the declarations");
  }

  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error("Only JPG, PNG and PDF files are allowed");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File size must be 10MB or less");
  }

  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found. Please select seller role first.");
  }

  const resourceType =
    file.mimetype === "application/pdf" ? "raw" : "image";

  const safeBaseName = cleanedFullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const uploadResult = await uploadBufferToCloudinary(file.buffer, {
    folder: `recipechain/seller-kyc/${userId}`,
    public_id: `${Date.now()}-${safeBaseName || "seller-id"}`,
    resource_type: resourceType,
    use_filename: false,
    unique_filename: false,
    overwrite: true,
    tags: ["recipechain", "seller-kyc"],
    context: {
      app: "RecipeChain",
      module: "seller-kyc",
      user_id: String(userId),
    },
  });

  const updatedSeller = await sellerModel.updateSellerByUserId(userId, {
    full_name: cleanedFullName,
    display_name: cleanedFullName,
    date_of_birth: dateOfBirth,
    nationality: cleanedNationality,
    address: cleanedAddress,
    phone_no: cleanedPhoneNo,
    nic_no: cleanedNicNo,
    cloudinary_public_id: uploadResult.public_id,
    id_document_resource_type: resourceType,
    id_document_original_name: file.originalname,
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