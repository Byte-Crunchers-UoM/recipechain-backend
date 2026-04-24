import Joi from 'joi';


const userSchema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    email: Joi.string().email().max(100).required()
});

const recipeSchema = Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().min(10).max(2000).required(),
    price: Joi.number().positive().required(),
    prep_time: Joi.number().integer().min(0).required(),
    cook_time: Joi.number().integer().min(0).required(),
    servings: Joi.number().integer().min(1).required(),
    ingredients: Joi.array().items(Joi.string().min(3)).min(1).required(),
    instructions: Joi.array().items(Joi.string().min(5)).min(1).required(),
    image_url: Joi.string().uri().optional().allow('', null),
    difficulty_level: Joi.string().optional().allow('', null),
    rating_avg: Joi.number().min(0).max(5).optional().allow(null),
    chef_note: Joi.string().max(1000).optional().allow('', null),
    status: Joi.string().valid('draft', 'published', 'archived').required(),
    tags: Joi.object({
        dietary_tags: Joi.array().items(Joi.string()).optional().allow(null),
        goal: Joi.string().optional().allow('', null),
        meal_type: Joi.string().optional().allow('', null),
        occasion: Joi.string().optional().allow('', null),
        cuisine: Joi.string().optional().allow('', null)
    }).optional().allow(null)
});

const validateUser = (req, res, next) => {
    console.log('Validator - req.body:', req.body);

    // Check if body exists
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Request body is required',
            error: ['Request body cannot be empty']
        });
    }

    const { error } = userSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message,
            error: error.details.map(detail => detail.message)
        });
    }
    next();
}; 

const validateRecipe = (req, res, next) => {
    const allowedStatuses = ["pending", "published", "rejected"];

    if (!req.body) {
        req.body = {};
    }

    const status = (req.body.status ?? "").toString().trim().toLowerCase();

    // Check if status is empty
    if (!status) {
        return res.status(400).json({
            success: false,
            message: "Status is required",
            missingFields: ["status"]
        });
    }

    // Check if status is valid
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid status value: ${status}`,
            allowed: allowedStatuses
        });
    }

    // Set normalized status
    req.body.status = status;
    next();
};

export { validateUser, validateRecipe };