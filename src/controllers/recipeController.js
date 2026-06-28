//src/recipeController.js
import { supabase } from '../config/supabase.js'; 

import recipeService from "../services/recipeService.js";
import { checkPurchaseStatusModel } from '../models/recipesModel.js';

/**
 * Standardizes API responses across the recipe controller.
 * Ensures the frontend always receives data in a predictable format.
 */
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

/**
 * Searches for recipes by keyword query keyword.
 * Provides a fast text-based search feature for the marketplace.
 */
export const searchRecipes = async (req, res, next) => {
    try {
        const searchTerm = req.query.q;
        const userId = req.user?.user_id || req.user?.id;
        
        if (!searchTerm) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

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

/**
 * Fetches all available published recipes on the platform.
 * Typically used for the homepage or main marketplace feed.
 */
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
};

/**
 * Handles the creation of a new recipe by a seller.
 * Captures all culinary details and stores them in the database
 * so they can be monetized.
 */
export const addRecipe = async (req, res, next ) => {
    try{
        const{
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
        }); // <-- ADDED MISSING BRACE HERE
    } catch (error){
        next(error);
    } // <-- ADDED MISSING BRACE HERE
};

/**
 * Fetches details of a specific recipe.
 * Acts as a premium gatekeeper: strips out sensitive instructions/ingredients
 * if the requesting user hasn't purchased the recipe.
 */
export const getRecipeById = async (req, res, next) => {
    try {
        const recipeId = req.params.id;
        
        console.log("---- DEBUG GET RECIPE ----");
        console.log("req.user Object from Middleware:", req.user); 

        const recipe = await recipeService.getRecipeById(recipeId);

        if (!recipe) {
            return res.status(404).json({ success: false, message: 'Recipe not found' });
        }

        let hasAccess = false;

        console.log("---- CHECKING RECIPE ACCESS ----");
        console.log("Is User Logged In?:", req.user ? "YES" : "NO");

        const userId = req.user?.user_id || req.user?.id; 

        if (userId) {
            // 1. Check if this is the creator
            const isSeller = recipe.chef_id === userId || recipe.sellers?.user_id === userId; 
            
            // 2. Check if this is a buyer (from the Model)
            const hasPurchased = await checkPurchaseStatusModel(userId, recipeId);

            // 3. Check if this is an Admin reviewing the recipe
            const { data: profileData } = await supabase
                .from("users")
                .select("role")
                .eq("user_id", userId)
                .single();
            const isAdmin = profileData?.role === "admin";

            // If they are the creator, a buyer, OR an admin, unlock it!
            if (isSeller || hasPurchased || isAdmin) {
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

/**
 * Facilitates the purchase/unlocking process of a premium recipe.
 * Expects a completed XRPL transaction hash, verifies it, and grants
 * access if the payment is valid.
 */
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