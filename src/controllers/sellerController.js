import sellerService from "../services/sellerService.js";

/**
 * Submits seller KYC details and uploaded ID documents.
 *
 * @param {import("express").Request} req - Request containing session user ID, KYC form body, and uploaded files.
 * @param {import("express").Response} res - Response used to return submission result.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
const submitKyc = async (req, res, next) => {
  try {
    /**
     * Seller KYC must be linked to the currently logged-in user.
     * The session middleware should attach user_id to req.session before this controller runs.
     */
    const userId = req.session?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    /**
     * The service layer handles validation, duplicate identity checks,
     * file upload/storage, and database updates.
     */
    const result = await sellerService.submitKyc({
      userId,
      body: req.body,
      files: req.files,
    });

    return res.status(200).json({
      message: "KYC submitted successfully",
      data: result,
    });
  } catch (error) {
    /**
     * Duplicate NIC/phone checks need a special response so the frontend
     * can show a clear warning instead of a generic server error.
     */
    if (error?.name === "DuplicateSellerIdentityError") {
      return res.status(error.statusCode || 409).json({
        message: "duplicate_seller_identity",
        field: error.field,
        status: error.status,
        friendlyMessage: error.friendlyMessage,
      });
    }

    /**
     * Unknown errors are passed to Express global error middleware.
     * This keeps controller code clean and avoids repeated error responses.
     */
    next(error);
  }
};

/**
 * Returns the logged-in seller's current KYC status.
 *
 * @param {import("express").Request} req - Request containing session user ID.
 * @param {import("express").Response} res - Response used to return KYC status.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
const getKycStatus = async (req, res, next) => {
  try {
    /**
     * KYC status is private user data, so it must be fetched only
     * for the authenticated seller from the session.
     */
    const userId = req.session?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    const status = await sellerService.getKycStatus(userId);

    return res.status(200).json({
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marks the seller approval success page as already seen.
 *
 * @param {import("express").Request} req - Request containing session user ID.
 * @param {import("express").Response} res - Response used to return update result.
 * @param {import("express").NextFunction} next - Express error handler.
 * @returns {Promise<void>}
 */
const markKycApprovalPageSeen = async (req, res, next) => {
  try {
    /**
     * This prevents approved sellers from seeing the success page repeatedly.
     * After this is marked, future logins can route directly to the dashboard.
     */
    const userId = req.session?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

    const result = await sellerService.markKycApprovalPageSeen(userId);

    return res.status(200).json({
      message: "KYC approval page marked as seen",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  submitKyc,
  getKycStatus,
  markKycApprovalPageSeen,
};