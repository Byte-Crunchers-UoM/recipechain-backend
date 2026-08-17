//src/controllers/savedRecipeController.js
import savedRecipesService from "../services/savedRecipesService.js";

const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({ success, message, data, recipes: data });
}

export const getSavedRecipes = async (req, res, next) => {
    try {
        const userId = req.params.user_id; // 🛠️ CHANGED: No longer calling it email
        console.log("The ID received in the GET URL is:", userId);

        if (!userId) {
            return sendResponse(res, 400, false, "User ID parameter is required.");
        }

        const savedRecipes = await savedRecipesService.getSavedRecipes(userId); 
        return sendResponse(res, 200, true, "Retrieved saved recipes successfully", savedRecipes);
        
    } catch(err) {
        next(err);
    }
}
    
export const addSavedRecipe = async(req, res, next) => {
    try {
        // 🛠️ CHANGED: Removed the ": email" alias
        const { user_id, recipe_id } = req.body; 
        
        if (!user_id || !recipe_id) {
            return sendResponse(res, 400, false, "Missing user_id or recipe_id in request body");
        }
        
        const data = await savedRecipesService.addSavedRecipes(user_id, recipe_id);
        return sendResponse(res, 201, true, "Recipe saved successfully", data);

    } catch(err) {
        next(err);
    }
}

export const deleteSavedRecipes = async (req, res, next) => {
    try {
        // 🛠️ CHANGED: Removed the ": email" alias
        const { user_id, recipe_id } = req.body; 
        
        if (!user_id || !recipe_id) {
            return sendResponse(res, 400, false, "Missing user_id or recipe_id in request body");
        }

        await savedRecipesService.deleteSavedRecipe(user_id, recipe_id);
        return sendResponse(res, 200, true, "Recipe removed from saved list");

    } catch(err) {
        next(err);
    }
}