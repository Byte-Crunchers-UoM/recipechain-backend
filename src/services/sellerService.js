import sellerModel from "../models/sellerModel.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];

/**
 * Ensures a seller row exists for the selected seller user.
 * This is used when a user chooses the seller role.
 *
 * @param {object} params - Seller role selection params.
 * @param {string} params.userId - Logged-in user's ID.
 * @returns {Promise<object>} Existing or newly created seller row.
 */
const selectSellerRole = async ({ userId }) => {
  const existingSeller = await sellerModel.findSellerByUserId(userId);

  if (existingSeller) {
    return existingSeller;
  }

  return await sellerModel.createSeller({
    user_id: userId,
  });
};

/**
 * Normalizes NIC/passport values before duplicate checking.
 * This prevents the same ID being treated as different because of spaces or symbols.
 */
const normalizeNic = (value = "") => {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
};

/**
 * Normalizes phone numbers before duplicate checking.
 * This prevents duplicates caused by spaces, brackets, or hyphens.
 */
const normalizePhone = (value = "") => {
  return value.replace(/[^\d+]/g, "").trim();
};

/**
 * Validates uploaded KYC document before sending it to Cloudinary.
 * Backend validation is required because frontend validation can be bypassed.
 */
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

/**
 * Uploads one KYC document to Cloudinary and returns metadata for database storage.
 *
 * @param {object} params - Upload params.
 * @param {object} params.file - Multer file object.
 * @param {string} params.userId - Seller user ID.
 * @param {string} params.cleanedFullName - Seller full name used for readable asset naming.
 * @param {"front" | "back"} params.side - ID document side.
 * @returns {Promise<object>} Cloudinary URL/public ID/resource metadata.
 */
const uploadKycDocument = async ({
  file,
  userId,
  cleanedFullName,
  side,
}) => {
  const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";

  /**
   * Safe public IDs avoid spaces and special characters in Cloudinary asset names.
   */
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

/**
 * Builds a structured duplicate identity error for NIC/phone conflicts.
 * The frontend uses these fields to show a clear user-friendly warning.
 */
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

/**
 * Submits or resubmits seller KYC details.
 *
 * @param {object} params - KYC submission params.
 * @param {string} params.userId - Logged-in seller user ID.
 * @param {object} params.body - KYC form text fields.
 * @param {object} params.files - Uploaded front/back ID documents from Multer.
 * @returns {Promise<object>} Updated seller row.
 */
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

  /**
   * Required text fields are checked here before file upload to avoid
   * unnecessary Cloudinary uploads for incomplete submissions.
   */
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

  /**
   * Legal declarations must be explicitly accepted before sending KYC for review.
   */
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

  /**
   * Pending submissions should not be overwritten while admin review is active.
   */
  if (seller.verification_status === "pending") {
    throw new Error(
      "Your KYC verification is already under review. Please wait for the review to complete before resubmitting."
    );
  }

  /**
   * Approved sellers do not need to submit KYC again.
   */
  if (seller.verification_status === "approved") {
    throw new Error(
      "Your KYC has already been approved. No further submissions are required."
    );
  }

  const normalizedNic = normalizeNic(cleanedNicNo);
  const normalizedPhone = normalizePhone(cleanedPhoneNo);

  /**
   * Duplicate checks enforce the one-seller-account-per-person rule.
   * Current user is excluded so rejected sellers can resubmit their own record.
   */
  const nicOwner = await sellerModel.findSellerByNicNormalized(
    normalizedNic,
    userId
  );

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

  /**
   * Upload both document sides only after all validation and duplicate checks pass.
   */
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

  /**
   * After successful upload, seller status becomes pending for admin review.
   * Previous rejection reason is cleared because this is a fresh submission.
   */
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

    /**
     * Legacy single-document fields are kept for compatibility with older code.
     */
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

/**
 * Returns seller KYC status and submitted details for the logged-in seller.
 */
const getKycStatus = async (userId) => {
  const seller = await sellerModel.findSellerByUserId(userId);

  if (!seller) {
    throw new Error("Seller record not found");
  }

  return await sellerModel.getKycStatusByUserId(userId);
};

/**
 * Marks the approval success page as seen.
 * Only approved sellers can do this so pending/rejected users cannot skip review.
 */
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