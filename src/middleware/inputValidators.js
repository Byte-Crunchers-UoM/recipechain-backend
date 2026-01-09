import Joi from 'joi';


const userSchema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    email: Joi.string().email().max(100).required()
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

export default validateUser;