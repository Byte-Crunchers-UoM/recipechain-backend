import recipeService from '../services/recipeService.js';

//CREATE
export const addRecipe = async (req, res, next) => {
    try {
        const {
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

        if (!title || !description || !status) {
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
            success: true,
            message: 'Recipe saved successfully',
            recipe
        });

    } catch (error) {
        next(error);
    }
};

//READ
export const getRecipeById = async (req, res, next) => {
    try {
        const recipe = await recipeService.getRecipeById(req.params.id);

        res.status(200).json({
            success: true,
            recipe
        });
    } catch (error) {
        next(error);
    }
};

//UPDATE
export const updateRecipe = async (req, res, next) => {
    try {
        const recipe = await recipeService.updateRecipe(
            req.params.id,
            req.body
        );

        res.status(200).json({
            success: true,
            message: 'recipe updated successfully',
            recipe
        });
    } catch (error) {
        next(error);
    }
};

//DELETE
//DELETE
export const deleteRecipe = async (req, res, next) => {
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

// GET TRENDING
export const getTrendingRecipes = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const category = req.query.category || null;

        const recipes = await recipeService.getTrendingRecipes(limit, category);

        res.status(200).json({
            success: true,
            count: recipes.length,
            recipes
        });
    } catch (error) {
        next(error);
    }
};

export const getRecipesByChef = async (req, res, next) => {
    try {
        const { id } = req.params;
        const recipes = await recipeService.getRecipesByChef(id);
        res.status(200).json({
            success: true,
            data: recipes
        });
    } catch (error) {
        next(error);
    }
};