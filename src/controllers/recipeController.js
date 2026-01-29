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

//CREATE
export const addRecipe = async (req, res, next ) => {
    try{
        const{
            title,
            description,
            category,
            difficulty_level,
            prep_time,
            cook_time,
            servings,
            dietary_tags,
            ingredients,
            instructions,
            chef_note,
            image_url,
            status
        } = req.body;
        
        if (!title || !description || !status){
            return res.status(400).json({
                success: false,
                message: 'Title,description and status are required'
            });
        }

        const recipe = await recipeService.addRecipe({
                title,
                description,
                category,
                difficulty_level,
                prep_time,
                cook_time,
                servings,
                dietary_tags,
                ingredients,
                instructions,
                chef_note,
                image_url,
                status
            });

    res.status(201).json({
        success:true,
        message:'Recipe saved successfully' ,
        recipe
    });

    }catch (error){
        next(error);
    }
};

//READ
export const getRecipeById =async (req, res, next)=>{
    try{
        const recipe = await recipeService.getRecipeById(req.params.id);

        res.status(200).json({
            success:true,
            recipe
        });
    } catch (error) {
        next(error);
    }
};

//UPDATE
export const updateRecipe = async (req, res, next) => {
    try {
        const recipe =await recipeService.updateRecipe(
            req.params.id,
            req.body
        );

        res.status(200).json({
            success:true,
            message:'recipe updated successfully',
            recipe
        });
    } catch (error) {
        next(error);
    }
};

//DELETE
export const deleteRecipe = async (req, res, next)=> {
    try {
        await recipeService.deleteRecipe(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Recipe deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};