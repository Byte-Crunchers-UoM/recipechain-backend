import recipeService from "../services/recipeService.js";

const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({
        success,
        message,
        data
    })
}

// 1. ADDED: Fetch all recipes for the admin table
export const getAllRecipes = async (req, res, next) => {
    try {
        const recipes = await recipeService.getAllRecipes();
        return sendResponse(res, 200, true, 'Recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}

// 2. ADDED: Fetch filtered recipes
export const getFilteredRecipes = async (req, res, next) => {
    try {
        const filters = {
            goal: req.query.goal,
            dietary: req.query.dietary,
            cuisine: req.query.cuisine,
            meal: req.query.meal,
            occassion: req.query.occassion
        };
        const recipes = await recipeService.getFilteredrecipes(filters);
        return sendResponse(res, 200, true, 'Filtered recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}

// CREATE 
export const addRecipe = async (req, res, next) => {
    try {
        const { title, description, status } = req.body;
        if (!title || !description || !status) {
            return sendResponse(res, 400, false, 'Title, description and status are required');
        }
        const recipe = await recipeService.addRecipe(req.body);
        return sendResponse(res, 201, true, 'Recipe saved successfully', recipe);
    } catch (error) {
        next(error);
    }
};

// READ BY ID 
export const getRecipeById = async (req, res, next) => {
    try {
        const recipe = await recipeService.getRecipeById(req.params.id);
        if (!recipe) {
            return sendResponse(res, 404, false, 'Recipe not found');
        }
        return sendResponse(res, 200, true, 'Recipe retrieved successfully', recipe);
    } catch (error) {
        next(error);
    }
};

// src/controllers/recipeController.js

export const verifyRecipe = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approval_status, admin_note } = req.body;

    const updatedRecipe = await recipeService.verifyRecipe(id, { status: approval_status, admin_note });
    
    return sendResponse(
      res, 
      200, 
      true, 
      `Recipe status updated to ${approval_status === 'published' ? 'pending' : 'rejected'}`, 
      updatedRecipe
    );
  } catch (error) {
    next(error);
  }
};

// UPDATE 
export const updateRecipe = async (req, res, next) => {
    try {
        const recipe = await recipeService.updateRecipe(req.params.id, req.body);
        if (!recipe) {
            return sendResponse(res, 404, false, 'Recipe not found');
        }
        return sendResponse(res, 200, true, 'Recipe updated successfully', recipe);
    } catch (error) {
        next(error);
    }
};

// DELETE 
export const deleteRecipe = async (req, res, next) => {
    try {
        await recipeService.deleteRecipe(req.params.id);
        return sendResponse(res, 200, true, 'Recipe deleted successfully');
    } catch (error) {
        next(error);
    }
};