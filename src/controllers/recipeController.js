import recipeService from '../services/recipeService.js';

// CREATE
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
            status, 
            tags
        } = req.body;

        const imageUrl = req.file ? req.file.path : null;

        const chef_id = req.user?.id; 

        const result = await recipeService.addRecipe({
            title, 
            description, 
            image_url: imageUrl,
            difficulty_level,
            prep_time, 
            cook_time, 
            servings, 
            price,
            rating_avg, 
            ingredients, 
            instructions,
            chef_note, 
            status, 
            chef_id, 
            tags    
        });

        res.status(201).json({
            success: true,
            message: 'Recipe saved successfully',
            recipe: result.recipe,
            tag: result.tag || null
        });
    } catch (error) {
        next(error);
    }
};

// READ
export const getRecipeById = async (req, res, next) => {
    try {
        const recipe = await recipeService.getRecipeById(req.params.id);
        res.status(200).json({ success: true, recipe });
    } catch (error) {
        next(error);
    }
};

// UPDATE
export const updateRecipe = async (req, res, next) => {
    try {
        let updateData = { ...req.body };
        
        if (req.file) {
            updateData.image_url = req.file.path;
        }

        const recipe = await recipeService.updateRecipe(req.params.id, updateData);
        res.status(200).json({
            success: true,
            message: 'Recipe updated successfully',
            recipe
        });
    } catch (error) {
        next(error);
    }
};

// DELETE - THIS WAS THE MISSING FUNCTION CAUSING THE CRASH
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