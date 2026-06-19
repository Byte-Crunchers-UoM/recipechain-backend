import Joi from "joi";

/**
 * Defines the expected shape of user request data.
 * Joi is used here so invalid user input is blocked before reaching the controller/service layer.
 */
const userSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().max(100).required(),
});

/**
 * Validates user request body before user-related controller logic runs.
 *
 * @param {import("express").Request} req - Express request containing user data in req.body.
 * @param {import("express").Response} res - Express response used to return validation errors.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
const validateUser = (req, res, next) => {
  console.log("Validator - req.body:", req.body);

  /**
   * Empty request bodies should fail early because Joi validation messages
   * are clearer when the body is known to exist.
   */
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body is required",
      error: ["Request body cannot be empty"],
    });
  }

  const { error } = userSchema.validate(req.body);

  if (error) {
    /**
     * Return all Joi validation messages so the frontend can show
     * complete feedback instead of fixing one field at a time.
     */
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      error: error.details.map((detail) => detail.message),
    });
  }

  /**
   * If validation passes, continue to the next middleware/controller.
   */
  next();
};

export default validateUser;