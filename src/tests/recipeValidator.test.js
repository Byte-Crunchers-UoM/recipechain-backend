export const validateRecipe = (req, res, next) => {
  const allowedStatuses = ["pending", "published", "rejected", "draft"];

  const approval_status = (req.body.approval_status ?? "").toString().trim().toLowerCase();

  if (!approval_status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
      missingFields: ["approval_status"]
    });
  }

  if (!allowedStatuses.includes(approval_status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status value: ${approval_status}`,
      allowed: allowedStatuses
    });
  }

  req.body.approval_status = approval_status;
  next();
};