import Joi from "joi";

/**
 * Defines the expected shape of user request data.
 * Joi is used here so invalid user input is blocked before reaching the controller/service layer.
 */
const userSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().max(100).required(),
});

const recipeSchema = Joi.object({
    title: Joi.string().min(3).max(200).required(),
    
    description: Joi.string().min(3).max(2000).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow('', null),
        otherwise: Joi.required()
    }),
    
    price: Joi.number().positive().when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow('', null, 0),
        otherwise: Joi.required()
    }),

    prep_time: Joi.number().integer().min(0).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow('', null, 0),
        otherwise: Joi.required()
    }),
    
    cook_time: Joi.number().integer().min(0).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow('', null, 0),
        otherwise: Joi.required()
    }),
    
    servings: Joi.number().integer().min(1).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow('', null, 0),
        otherwise: Joi.required()
    }),
    
    ingredients: Joi.array().items(
        Joi.object({
            id: Joi.string(),
            name: Joi.string().optional().allow('', null),
            quantity: Joi.string().optional().allow('', null),
            unit: Joi.string().optional().allow('', null)
        })
    ).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow(null),
        otherwise: Joi.required()
    }),
    
    instructions: Joi.array().items(Joi.string().min(1)).when('approval_status', {
        is: 'draft',
        then: Joi.optional().allow(null),
        otherwise: Joi.required()
    }),
    
    image_url: Joi.string().uri().optional().allow('', null),
    difficulty_level: Joi.string().optional().allow('', null, 'easy', 'medium', 'hard'),
    rating_avg: Joi.number().min(0).max(5).optional().allow(null),
    chef_note: Joi.string().max(1000).optional().allow('', null),
    approval_status: Joi.string().valid('draft', 'published', 'pending', 'rejected').required(),
    chef_id: Joi.string().optional(),
    
    cuisine: Joi.string().optional().allow('', null),
    meal_type: Joi.string().optional().allow('', null),
    goal: Joi.string().optional().allow('', null),
    occasion: Joi.string().optional().allow('', null),
    dietary_tags: Joi.alternatives().try(
        Joi.array().items(Joi.string()),
        Joi.string().allow('', null),
        Joi.any().allow(null)
    ).optional(),

    tags: Joi.object({
        dietary_tags: Joi.array().items(Joi.string()).optional().allow(null),
        goal: Joi.string().optional().allow('', null),
        meal_type: Joi.string().optional().allow('', null),
        occasion: Joi.string().optional().allow('', null),
        cuisine: Joi.string().optional().allow('', null)
    }).optional().allow(null)
}).unknown(true); 

const validateUser = (req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Request body is required'
        });
    }
    const { error } = userSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
}; 

const validateRecipe = (req, res, next) => {
    if (req.body.approval_status) {
        req.body.approval_status = req.body.approval_status.toString().trim().toLowerCase();
    } else {
        req.body.approval_status = 'pending'; 
    }

    const { error } = recipeSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        const isStatusError = error.details.some(d => d.context.key === 'approval_status');

        return res.status(400).json({
            success: false,
            message: isStatusError ? "Status is required or invalid" : error.details[0].message,
            errors: errorMessages,
            missingFields: error.details.map(d => d.context.key) 
        });
    }

    next();
};

export { validateUser, validateRecipe };