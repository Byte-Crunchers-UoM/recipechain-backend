import recipeService from "../services/recipeService.js";

const sendResponse = (res, statusCode,success,message,data = null)=>{
    res.status(statusCode).json({
        success,
        message,
        data
    })

}

export const getAllRecipes = async(req, res, next)=>{
    try{
    const recipes = await recipeService.getAllRecipes();
    return sendResponse(res, 200,true, 'recipes retrieved successfully',recipes);
    }catch(err){
        next(err);
    }
}
export const getRecipesByTag = async(req,res,next)=>{
    try{
        const {tags} = req.query;

        const tagsArray = tags ? tags.split(',') : [];

        const recipes = await recipeService.getRecipesByTag(tagsArray);
        if(!recipes){
            return sendResponse(res,404,'recipes not found');
        }
        return sendResponse(res,200,true,'recipes retrieved successfilly',recipes);
    }catch(err){
        next(err);
    }
}