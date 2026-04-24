export const validateRecipe = (req, res, next) => {
  const allowedStatuses = ["pending", "published", "rejected"];

  const status = (req.body.status ?? "").trim().toLowerCase();

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required"
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status value: ${status}`,
      allowed: allowedStatuses
    });
  }

  req.body.status = status;
  next();
};