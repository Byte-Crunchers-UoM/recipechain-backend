import sellerService from "../services/sellerService.js";

const submitKyc = async (req, res, next) => {
  try {
    const userId = req.session?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "No session user_id found" });
    }

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
    if (error?.name === "DuplicateSellerIdentityError") {
      return res.status(error.statusCode || 409).json({
        message: "duplicate_seller_identity",
        field: error.field,
        status: error.status,
        friendlyMessage: error.friendlyMessage,
      });
    }

    next(error);
  }
};

const getKycStatus = async (req, res, next) => {
  try {
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

const markKycApprovalPageSeen = async (req, res, next) => {
  try {
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