import recipeService from "../services/recipeService.js";

const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({
        success,
        message,
        data
    });
};

export const getFilteredRecipes = async (req, res, next) => {
    try {
        const filters = {
            goal: req.query.goal,
            dietary: req.query.dietary,
            cuisine: req.query.cuisine,
            meal: req.query.meal,
            occasion: req.query.occasion
        };
        const recipes = await recipeService.getFilteredrecipes(filters);
        if (!recipes || recipes.length === 0) {
            return sendResponse(res, 200, true, 'No recipes found matching your filters', []);
        }
        return sendResponse(res, 200, true, 'filtered recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
};

export const getAllRecipes = async (req, res, next) => {
    try {
        const recipes = await recipeService.getAllRecipes();
        return sendResponse(res, 200, true, 'recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
};

export const addRecipe = async (req, res, next) => {
    try {
        const {
            title,
            description,
            image_url,
            difficulty_level,
            prep_time,
            cook_time,
            servings,
            price,
            rating_avg,
            ingredients,
            instructions,
            chef_note,
            approval_status,
            tags,
            chef_id,
            status
        } = req.body;

        const finalImageUrl = image_url || (req.file ? req.file.path : null);
        const finalChefId = chef_id || req.user?.id;
        
        // Status logic:
        // - If approval_status is 'draft': status='draft', approval_status='draft' (Save Draft)
        // - If approval_status is anything else: status='draft', approval_status='pending' (Submit Recipe)
        const finalApprovalStatus = approval_status === 'draft' ? 'draft' : 'pending';

        const finalRecipeData = {
            title: title || 'Draft Recipe',
            description: description || null,
            image_url: finalImageUrl,
            difficulty_level: difficulty_level || null,
            prep_time: prep_time !== '' && prep_time !== null ? Number(prep_time) : null,
            cook_time: cook_time !== '' && cook_time !== null ? Number(cook_time) : null,
            servings: servings !== '' && servings !== null ? Number(servings) : null,
            price: price !== '' && price !== null ? Number(price) : null,
            rating_avg: rating_avg !== '' && rating_avg !== null ? Number(rating_avg) : null,
            ingredients: ingredients || [],
            instructions: instructions || [],
            chef_note: chef_note || '',
            status: 'draft',
            approval_status: finalApprovalStatus,
            chef_id: finalChefId,
            tags,
        };

        const result = await recipeService.addRecipe(finalRecipeData);

        res.status(201).json({
            success: true,
            message: finalApprovalStatus === 'draft' ? 'Recipe saved as draft successfully' : 'Recipe submitted for approval successfully',
            recipe: result.recipe,
            tag: result.tag || null
        });
    } catch (error) {
        next(error);
    }
};

export const getRecipeById = async (req, res, next) => {
    try {
        const recipe = await recipeService.getRecipeById(req.params.id);
        res.status(200).json({ success: true, recipe });
    } catch (error) {
        next(error);
    }
};

export const updateRecipe = async (req, res, next) => {
    try {
        const {
            title,
            description,
            image_url,
            difficulty_level,
            prep_time,
            cook_time,
            servings,
            price,
            ingredients,
            instructions,
            chef_note,
            tags, 
            status,
            approval_status
        } = req.body;

        const finalImageUrl = req.file ? req.file.path : image_url;

        const isDraftOnly = (status === 'draft' && approval_status === 'draft');
        const isSubmit = (status === 'draft' && approval_status === 'pending');

        const updateData = {
            title: title || 'Untitled Recipe',
            description: description || null,
            image_url: finalImageUrl,
            difficulty_level: difficulty_level || null,
            prep_time: prep_time !== '' && prep_time !== null ? Number(prep_time) : null,
            cook_time: cook_time !== '' && cook_time !== null ? Number(cook_time) : null,
            servings: servings !== '' && servings !== null ? Number(servings) : null,
            price: price !== '' && price !== null ? Number(price) : null,
            ingredients: ingredients || [],
            instructions: instructions || [],
            chef_note: chef_note || '',
            approval_status: isSubmit ? 'pending' : 'draft',
            status: 'draft' 
        };

        const recipe = await recipeService.updateRecipe(req.params.id, updateData, tags);
        
        res.status(200).json({
            success: true,
            message: isSubmit ? 'Recipe submitted for approval' : 'Draft updated successfully',
            recipe
        });
    } catch (error) {
        next(error);
    }
};

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