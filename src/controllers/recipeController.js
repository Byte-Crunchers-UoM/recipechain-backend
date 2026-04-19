import recipeService from "../services/recipeService.js";

const sendResponse = (res, statusCode,success,message,data = null)=>{
    res.status(statusCode).json({
        success,
        message,
        data
    })

}


//Filter Recipes
export const getFilteredRecipes = async (req, res, next) => {
    try {
        const filters = {};
        if (req.query.difficulty_level) filters.difficulty_level = req.query.difficulty_level;
        if (req.query.goal) filters.goal = req.query.goal;
        if (req.query.dietary_tags) filters.dietary_tags = req.query.dietary_tags;
        if (req.query.cuisine) filters.cuisine = req.query.cuisine;
        if (req.query.meal_type) filters.meal_type = req.query.meal_type;
        if (req.query.occasion) filters.occasion = req.query.occasion; 
        
        console.log("Filters reaching the backend:", filters); 
        const recipes = await recipeService.getFilteredrecipes(filters);
        
        if (!recipes || recipes.length === 0) {
            return sendResponse(res, 200, true, 'No recipes found matching your filters', []);
        }
        
        return sendResponse(res, 200, true, 'Filtered recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}


//Search recipes
export const searchRecipes = async (req, res, next) => {
    try {
        const searchTerm = req.query.q;
                const data = await recipeService.searchRecipes(searchTerm);
        
        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (error) {
        next(error); 
    }
};

//get all recipes
export const getAllRecipes = async(req, res, next)=>{
    try{
    const recipes = await recipeService.getAllRecipes();
    return sendResponse(res, 200, true, 'recipes retrieved successfully',recipes);
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