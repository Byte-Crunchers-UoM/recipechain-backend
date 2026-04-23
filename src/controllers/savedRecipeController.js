import savedRecipesService from "../services/savedRecipesService.js";

const sendResponse = (res, statusCode, success, message, data = null) =>{
    res.status(statusCode).json({
        success,
        message,
        data
    })
}

export const getSavedRecipes = async (req, res, next) => {
    try{
        const email = req.params.user_id; // 🛠️ Frontend එකෙන් එන්නේ email එක
        console.log("The ID received in the GET URL is:", email);

        const savedRecipes = await savedRecipesService.getSavedRecipes(email); 
        return sendResponse(res, 200, true, "retrieved saved recipes successfully", savedRecipes);
        
    }catch(err){
        next(err);
    }
}

export const addSavedRecipe = async(req, res, next) => {
    try{
        const { user_id: email, recipe_id } = req.body; // 🛠️ Frontend එකෙන් එන්නේ email එක
        console.log("Incoming Data:", email, recipe_id);
        if (!email || !recipe_id) {
            return sendResponse(res, 400, false, "Missing email or recipe_id in request body");
        }
        
        const data = await savedRecipesService.addSavedRecipes(email, recipe_id);
        return sendResponse(res, 201, true, "Recipe saved successfully", data);

    }catch(err){
        next(err)
    }
}

export const deleteSavedRecipes = async (req, res, next) =>{
    try{
        const { user_id: email, recipe_id } = req.body; // 🛠️ Frontend එකෙන් එන්නේ email එක
        if (!email || !recipe_id) {
            return sendResponse(res, 400, false, "Missing email or recipe_id in request body");
        }

        await savedRecipesService.deleteSavedRecipe(email, recipe_id);
        
        return sendResponse(res, 200, true, "Recipe removed from saved list");

    }catch(err){
        next(err)
    }
}