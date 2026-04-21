import sellerModel from "../models/sellerModel.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const selectSellerRole = async ({ userId }) => {
  const existingSeller = await sellerModel.findSellerByUserId(userId);

  if (existingSeller) {
    return existingSeller;
  }

  return await sellerModel.createSeller({
    user_id: userId,
  });
};

const normalizeNic = (value = "") => {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
};

const normalizePhone = (value = "") => {
  return value.replace(/[^\d+]/g, "").trim();
};

const validateDocumentFile = (file, label) => {
  if (!file) {
    throw new Error(`${label} is required`);
  }

  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    throw new Error(`${label}: only JPG, PNG and PDF files are allowed`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${label}: file size must be 10MB or less`);
  }
};

const uploadKycDocument = async ({
  file,
  userId,
  cleanedFullName,
  side,
}) => {
  const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";

  const safeBaseName = cleanedFullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const uploadResult = await uploadBufferToCloudinary(file.buffer, {
    folder: `recipechain/seller-kyc/${userId}`,
    public_id: `${Date.now()}-${safeBaseName || "seller-id"}-${side}`,
    resource_type: resourceType,
    use_filename: false,
    unique_filename: false,
    overwrite: true,
    tags: ["recipechain", "seller-kyc", side],
    context: {
      app: "RecipeChain",
      module: "seller-kyc",
      user_id: String(userId),
      document_side: side,
    },
  });

  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    resourceType,
    originalName: file.originalname,
  };
};

const buildDuplicateIdentityError = ({ field, status }) => {
  const safeStatus = status || "pending";

  let friendlyMessage = "";

  if (safeStatus === "approved") {
    friendlyMessage =
      field === "nicNo"
        ? "This NIC number is already linked to an approved seller account. Only one seller account is allowed per person. Please use the existing seller account."
        : "This phone number is already linked to an approved seller account. Only one seller account is allowed per person. Please use the existing seller account.";
  } else if (safeStatus === "rejected") {
    friendlyMessage =
      field === "nicNo"
        ? "A seller verification request using this NIC number already exists, but it was rejected. Please sign in to that same account and resubmit your details."
        : "A seller verification request using this phone number already exists, but it was rejected. Please sign in to that same account and resubmit your details.";
  } else {
    friendlyMessage =
      field === "nicNo"
        ? "A seller verification request using this NIC number is already under review. Only one seller account is allowed per person. Please wait for the review to finish or use the existing account."
        : "A seller verification request using this phone number is already under review. Only one seller account is allowed per person. Please wait for the review to finish or use the existing account.";
  }

  const error = new Error("duplicate_seller_identity");
  error.name = "DuplicateSellerIdentityError";
  error.statusCode = 409;
  error.field = field;
  error.status = safeStatus;
  error.friendlyMessage = friendlyMessage;

  return error;
};

const submitKyc = async ({ userId, body, files }) => {
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

  if (confirmAccuracy !== "true" || agreeTerms !== "true") {
    throw new Error("You must agree to the declarations");
  }

  const frontFile = files?.idDocumentFront?.[0];
  const backFile = files?.idDocumentBack?.[0];

  validateDocumentFile(frontFile, "Front side ID document");
  validateDocumentFile(backFile, "Back side ID document");

  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found. Please select seller role first.");
  }

  if (seller.verification_status === "pending") {
    throw new Error(
      "Your KYC verification is already under review. Please wait for the review to complete before resubmitting."
    );
  }

  if (seller.verification_status === "approved") {
    throw new Error(
      "Your KYC has already been approved. No further submissions are required."
    );
  }

  const normalizedNic = normalizeNic(cleanedNicNo);
  const normalizedPhone = normalizePhone(cleanedPhoneNo);

  const nicOwner = await sellerModel.findSellerByNicNormalized(normalizedNic, userId);
  if (nicOwner) {
    throw buildDuplicateIdentityError({
      field: "nicNo",
      status: nicOwner.verification_status,
    });
  }

  const phoneOwner = await sellerModel.findSellerByPhoneNormalized(
    normalizedPhone,
    userId
  );
  if (phoneOwner) {
    throw buildDuplicateIdentityError({
      field: "phoneNo",
      status: phoneOwner.verification_status,
    });
  }

  const frontUpload = await uploadKycDocument({
    file: frontFile,
    userId,
    cleanedFullName,
    side: "front",
  });

  const backUpload = await uploadKycDocument({
    file: backFile,
    userId,
    cleanedFullName,
    side: "back",
  });

  const updatedSeller = await sellerModel.updateSellerByUserId(userId, {
    full_name: cleanedFullName,
    display_name: cleanedFullName,
    date_of_birth: dateOfBirth,
    nationality: cleanedNationality,
    address: cleanedAddress,
    phone_no: cleanedPhoneNo,
    phone_no_normalized: normalizedPhone,
    nic_no: cleanedNicNo,
    nic_no_normalized: normalizedNic,

    id_document_front_url: frontUpload.url,
    id_document_front_public_id: frontUpload.publicId,
    id_document_front_resource_type: frontUpload.resourceType,
    id_document_front_original_name: frontUpload.originalName,

    id_document_back_url: backUpload.url,
    id_document_back_public_id: backUpload.publicId,
    id_document_back_resource_type: backUpload.resourceType,
    id_document_back_original_name: backUpload.originalName,

    cloudinary_public_id: frontUpload.publicId,
    id_document_resource_type: frontUpload.resourceType,
    id_document_original_name: frontUpload.originalName,

    verification_status: "pending",
    verification_submitted_at: new Date().toISOString(),
    verified_at: null,
    rejection_reason: null,
    kyc_approval_page_seen: false,
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

const markKycApprovalPageSeen = async (userId) => {
  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found");
  }

  if (seller.verification_status !== "approved") {
    throw new Error(
      "KYC approval page can only be marked as seen for approved sellers"
    );
  }

  return await sellerModel.markKycApprovalPageSeenByUserId(userId);
};

export default {
  selectSellerRole,
  submitKyc,
  getKycStatus,
  markKycApprovalPageSeen,
};