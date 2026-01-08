import Joi from 'joi';

const recipeSchema = Joi.object({
    title: Joi.string().min(3).max(255).required(),
    description: Joi.string().allow('', null),
    ingredients: Joi.array().items(Joi.string()).required(),
    instructions: Joi.string().required(),
    userId: Joi.number().integer().required()
});

const validateRecipe = (req, res, next) => {

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Request body is required',
            error: ['Request body cannot be empty']
        });
    }

    const { error } = recipeSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message,
            error: error.details.map(detail => detail.message)
        });
    }
    next();
};

export default validateRecipe;
