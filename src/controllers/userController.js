// src/controllers/userController.js
import userService from '../services/userService.js';

// Standardized response function - Great job setting this up!
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
        // Ensure your service handles the specific child-table (admin/chef/buyer)
        const newUser = await userService.createUser(username, email);
        return sendResponse(res, 201, true, 'User created successfully', newUser);
    } catch (err) {
        next(err);
    }
}

export const getUserById = async (req, res, next) => {
    try {
        // Change 'id' to 'user_id' to match your table definition
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
        // This will now fetch from your updated 'users' parent table
        const users = await userService.getAllUsers();
        
        // Handle empty arrays with a 200 status code as per best practice
        if (!users || users.length === 0) {
            return sendResponse(res, 200, true, 'No users found', []);
        }
        
        return sendResponse(res, 200, true, 'Users retrieved successfully', users);
    } catch (err) {
        next(err);
    }
}

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params; // This id refers to user_id in your DB
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