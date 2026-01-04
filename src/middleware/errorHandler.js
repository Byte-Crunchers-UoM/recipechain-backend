//centralized error handler
export const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'An unexpected error occurred';

    res.status(statusCode).json({
        success: false,
        message: message,
        error: process.env.NODE_ENV === 'production' ? null : err.stack,
        statusCode: statusCode
    });
};

export default errorHandler;