import {
  createUserModel,
  getUserByIdModel,
  getUserByEmailModel,
  getAllUsersModel,
  updateUserModel,
  deleteUserModel
} from '../models/userModel.js';

// Business logic layer

class UserService {
  // Email validation helper
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate username
  isValidUsername(username) {
    return username && username.trim().length >= 3;
  }

  async createUser(username, email) {
    // Validate input
    if (!this.isValidUsername(username)) {
      throw new Error('Username must be at least 3 characters long');
    }

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user with email already exists
    const existingUser = await getUserByEmailModel(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create user
    const newUser = await createUserModel(username.trim(), email.toLowerCase());
    return newUser;
  }

  async getUserById(id) {
    // Validate ID
    if (!id || isNaN(id)) {
      throw new Error('Invalid user ID');
    }

    const user = await getUserByIdModel(id);
    return user;
  }

  async getAllUsers() {
    const users = await getAllUsersModel();
    return users;
  }

  async updateUser(id, username, email) {
    // Validate ID
    if (!id || isNaN(id)) {
      throw new Error('Invalid user ID');
    }

    // Validate input
    if (!this.isValidUsername(username)) {
      throw new Error('Username must be at least 3 characters long');
    }

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user exists
    const existingUser = await getUserByIdModel(id);
    if (!existingUser) {
      return null;
    }

    // Check if email is taken by another user
    const userWithEmail = await getUserByEmailModel(email);
    if (userWithEmail && userWithEmail.id !== parseInt(id)) {
      throw new Error('Email is already taken by another user');
    }

    // Update user
    const updatedUser = await updateUserModel(id, username.trim(), email.toLowerCase());
    return updatedUser;
  }

  async deleteUser(id) {
    // Validate ID
    if (!id || isNaN(id)) {
      throw new Error('Invalid user ID');
    }

    // Check if user exists before deleting
    const existingUser = await getUserByIdModel(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    await deleteUserModel(id);
    return { message: 'User deleted successfully' };
  }
}

export default new UserService();
