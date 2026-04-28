import { supabase } from '../config/supabase.js'; 

import recipeService from "../services/recipeService.js";
import { checkPurchaseStatusModel } from '../models/recipesModel.js';

const sendResponse = (res, statusCode, success, message, data = null) => {
    res.status(statusCode).json({
        success,
        message,
        data
    });
}

// Filter Recipes
export const getFilteredRecipes = async (req, res, next) => {
    try {
        const filters = {};
        if (req.query.difficulty_level) filters.difficulty_level = req.query.difficulty_level;
        if (req.query.goal) filters.goal = req.query.goal;
        if (req.query.dietary_tags) filters.dietary_tags = req.query.dietary_tags;
        if (req.query.cuisine) filters.cuisine = req.query.cuisine;
        if (req.query.meal_type) filters.meal_type = req.query.meal_type;
        if (req.query.occasion) filters.occasion = req.query.occasion; 
        
        const userId = req.user?.user_id || req.user?.id;

        console.log("Filters reaching the backend:", filters); 
        // 🛠️ 2. Send the userId to the Service as well
        const recipes = await recipeService.getFilteredrecipes(filters, userId);
        
        if (!recipes || recipes.length === 0) {
            return sendResponse(res, 200, true, 'No recipes found matching your filters', []);
        }
        
        return sendResponse(res, 200, true, 'Filtered recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}

// Search recipes
export const searchRecipes = async (req, res, next) => {
    try {
        const searchTerm = req.query.q;
        const userId = req.user?.user_id || req.user?.id;
        
        // 🛠️ වචනයක් type කරලා නැත්නම් හිස් Array එකක් යවන්න (නැත්නම් Database Error එකක් එනවා)
        if (!searchTerm) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        // 🛠️ මෙතනට userId එකත් අනිවාර්යයෙන්ම දෙන්න ඕනේ!
        const data = await recipeService.searchRecipes(searchTerm, userId);
        
        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (error) {
        next(error); 
    }
};

// Get all recipes
export const getAllRecipes = async(req, res, next) => {
    try {
        // Get the User ID from optionalSession (undefined if not logged in)
        const userId = req.user?.user_id || req.user?.id; 

        // Pass that ID to the Service
        const recipes = await recipeService.getAllRecipes(userId);

        return sendResponse(res, 200, true, 'recipes retrieved successfully', recipes);
    } catch(err) {
        next(err);
    }
}

// CREATE
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
                message: 'Title, description and status are required'
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

// READ BY ID (WITH PREMIUM GATING)
export const getRecipeById = async (req, res, next) => {
    try {
        const recipeId = req.params.id;
        
        console.log("---- DEBUG GET RECIPE ----");
        console.log("req.user Object from Middleware:", req.user); // 🛠️ This is very important

        const recipe = await recipeService.getRecipeById(recipeId);

        if (!recipe) {
            return res.status(404).json({ success: false, message: 'Recipe not found' });
        }

        let hasAccess = false;

        console.log("---- CHECKING RECIPE ACCESS ----");
        console.log("Is User Logged In?:", req.user ? "YES" : "NO");

        // Sometimes the Token contains 'id' instead of 'user_id', which is why both are checked
        const userId = req.user?.user_id || req.user?.id; 

        if (userId) {
            // 1. Check if this is the creator
            const isSeller = recipe.chef_id === userId || recipe.sellers?.user_id === userId; 
            
            // 2. Check if this is a buyer (from the Model)
            // This function needs to be in your recipeModels.js
            const { checkPurchaseStatusModel } = await import('../models/recipesModel.js');
            const hasPurchased = await checkPurchaseStatusModel(userId, recipeId);

            console.log("User ID:", userId);
            console.log("Is Seller?:", isSeller);
            console.log("Has Purchased?:", hasPurchased);

            if (isSeller || hasPurchased) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            console.log("🔴 Access Denied: Sending Locked Version");
            delete recipe.ingredients;   
            delete recipe.instructions;  
            delete recipe.chef_note;     
            recipe.is_premium_locked = true; 
        } else {
            console.log("🟢 Access Granted: Sending Full Recipe");
            recipe.is_premium_locked = false; 
        }

        res.status(200).json({
            success: true,
            recipe
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE
export const updateRecipe = async (req, res, next) => {
    try {
        const recipe = await recipeService.updateRecipe(
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

// DELETE
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

// =======================================================
// UNLOCK RECIPE & REVENUE SPLIT
// =======================================================
export const unlockRecipe = async (req, res, next) => {
    try {
        const { recipeId, transactionHash } = req.body;
        const buyerId = req.user.user_id;

        if (!recipeId || !transactionHash) {
            return res.status(400).json({ success: false, message: 'recipeId and transactionHash are required' });
        }

        console.log("---- UNLOCK RECIPE API CALLED ----");
        
        // Hand over all the heavy lifting to the Service!
        await recipeService.processRecipeUnlock(buyerId, recipeId, transactionHash);

        return res.status(200).json({ 
            success: true, 
            message: 'Recipe unlocked and payment recorded successfully!' 
        });

    } catch (err) {
        // Catch the Errors sent by the Service and send them properly to the Frontend
        if (err.message.includes('Insufficient') || err.message.includes('incorrect') || err.message.includes('successful')) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next(err);
    }
};