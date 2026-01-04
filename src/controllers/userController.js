import userService from '../services/userService.js';

// Standardized response function
const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({
        success,
        message,
        data
    });
}

export const createUser = async (req, res, next) => {
    try {
        const { username, email } = req.body;
        const newUser = await userService.createUser(username, email);
        return sendResponse(res, 201, true, 'User created successfully', newUser);
    } catch (err) {
        next(err);
    }
}

export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userService.getUserById(id);
        if (!user) {
            return sendResponse(res, 404, false, 'User not found');
        }
        return sendResponse(res, 200, true, 'User retrieved successfully', user);
    } catch (err) {
        next(err);
    }
}

export const getAllUsers = async (req, res, next) => {
    try {
        const users = await userService.getAllUsers();
        return sendResponse(res, 200, true, 'Users retrieved successfully', users);
    } catch (err) {
        next(err);
    }
}

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { username, email } = req.body;
        const updatedUser = await userService.updateUser(id, username, email);
        if (!updatedUser) {
            return sendResponse(res, 404, false, 'User not found');
        }
        return sendResponse(res, 200, true, 'User updated successfully', updatedUser);
    } catch (err) {
        next(err);
    }
}

export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        await userService.deleteUser(id);
        return sendResponse(res, 200, true, 'User deleted successfully');
    } catch (err) {
        next(err);
    }
}
