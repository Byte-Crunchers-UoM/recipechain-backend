import recipeService from '../services/recipeService.js';

const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({
        success,
        message,
        data
    });
}

export const createRecipe = async (req, res, next) => {
    try {
        const recipe = await recipeService.createRecipe(req.body);
        return sendResponse(res, 201, true, 'Recipe created successfully', recipe);
    } catch (err) {
        next(err);
    }
}

export const getRecipeById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const recipe = await recipeService.getRecipeById(id);
        if (!recipe) {
            return sendResponse(res, 404, false, 'Recipe not found');
        }
        return sendResponse(res, 200, true, 'Recipe retrieved successfully', recipe);
    } catch (err) {
        next(err);
    }
}

export const getAllRecipes = async (req, res, next) => {
    try {
        const recipes = await recipeService.getAllRecipes();
        return sendResponse(res, 200, true, 'Recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}

export const updateRecipe = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedRecipe = await recipeService.updateRecipe(id, req.body);
        if (!updatedRecipe) {
            return sendResponse(res, 404, false, 'Recipe not found');
        }
        return sendResponse(res, 200, true, 'Recipe updated successfully', updatedRecipe);
    } catch (err) {
        next(err);
    }
}

export const deleteRecipe = async (req, res, next) => {
    try {
        const { id } = req.params;
        await recipeService.deleteRecipe(id);
        return sendResponse(res, 200, true, 'Recipe deleted successfully');
    } catch (err) {
        next(err);
    }
}
