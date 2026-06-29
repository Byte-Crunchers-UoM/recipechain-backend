//src/recipeController.js
import { supabase } from '../config/supabase.js'; 
import { getPaginationOptions, getPaginationMeta } from '../utils/paginations.js';
import recipeService from "../services/recipeService.js";
import { checkPurchaseStatusModel } from '../models/recipesModel.js';
import { logActivity } from '../utils/activityLogger.js';

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
}

/**
 * Handles requests to fetch recipes based on multiple category filters.
 * Vital for the marketplace's discovery and search experience.
 */
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
        const recipes = await recipeService.getFilteredrecipes(filters, userId);
        
        if (!recipes || recipes.length === 0) {
            return sendResponse(res, 200, true, 'No recipes found matching your filters', []);
        }
        
        return sendResponse(res, 200, true, 'Filtered recipes retrieved successfully', recipes);
    } catch (err) {
        next(err);
    }
}

/**
 * Searches for recipes by keyword query.
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
/**
 * Fetches all available published recipes on the platform with pagination.
 */

export const getAllRecipes = async (req, res, next) => {
    try {
        const userId = req.user?.user_id || req.user?.id; 
        
        // 1. Get safe, sanitized pagination options (Max 50 items per page)
        const { page, limit, from, to } = getPaginationOptions(req.query.page, req.query.limit, 10, 50);

        // 2. Pass the strict range down to the service
        const { recipes, totalCount } = await recipeService.getAllRecipes(userId, from, to);

        // 3. Generate standard metadata
        const paginationMeta = getPaginationMeta(totalCount, page, limit);

        // 4. Standardized JSON response
        return res.status(200).json({
            success: true,
            message: 'Recipes retrieved successfully',
            data: recipes,
            meta: paginationMeta // Industry standard is grouping pagination under 'meta'
        });
    } catch(err) {
        next(err);
    }
}
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
            const hasPurchased = await checkPurchaseStatusModel(userId, recipeId);

            // 3. NEW: Check if this is an Admin reviewing the recipe!
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

           /* console.log("User ID:", userId);
            console.log("Is Seller?:", isSeller);
            console.log("Has Purchased?:", hasPurchased);

            if (isSeller || hasPurchased) {
                hasAccess = true;
            }
        }*/

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

export const verifyRecipe = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approval_status, rejection_reason } = req.body;

    // 1. Update the recipe status using your service
    const updatedRecipe = await recipeService.verifyRecipe(id, { 
      approval_status: approval_status, 
      rejection_reason: rejection_reason 
    });
    console.log("DEBUG: Status is:", approval_status);

    // 2. Log the activity (ONLY if approved)
    if (approval_status === 'published') {
        console.log("DEBUG: Entering logActivity..."); // ADD THIS
      await logActivity(
        "Recipe Published", 
        `Recipe ID #${id} was published and is now live.`, 
        "PUBLICATION"
      );
    } else if (approval_status === 'rejected') {
      await logActivity(
        "Recipe Rejected", 
        `Recipe ID #${id} was rejected. Reason: ${rejection_reason}`, 
        "REJECTION"
      );
    }
    
    return sendResponse(
      res, 
      200, 
      true, 
      `Recipe has been ${approval_status}`, 
      updatedRecipe
    );
  } catch (error) {
    next(error);
  }
};

/*export const verifyRecipe = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approval_status, rejection_reason } = req.body;

    const updatedRecipe = await recipeService.verifyRecipe(id, { approval_status: approval_status, rejection_reason: rejection_reason });
    
    return sendResponse(
      res, 
      200, 
      true, 
      `Recipe has been ${approval_status}`, 
      updatedRecipe
    );
  } catch (error) {
    next(error);
  }
};
// UPDATE 

/**
 * Updates details of an existing recipe.
 * Allows chefs to modify their content after publication.
 */
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

/**
 * Deletes a recipe from the platform permanently.
 * Usually invoked by the creator or an admin to remove content.
 */
export const deleteRecipe = async (req, res, next)=> {
    try {
        await recipeService.deleteRecipe(req.params.id);
        return sendResponse(res, 200, true, 'Recipe deleted successfully');
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
/**
 * Returns an authoritative price quote for a set of recipe IDs before
 * the buyer signs an on-chain transaction. Works for guests too (no
 * "already purchased" filtering without a session, but pricing is correct).
 */
export const getCheckoutQuote = async (req, res, next) => {
    try {
        const { recipeIds } = req.body;
        const buyerId = req.user?.user_id || req.user?.id || null;

        if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
            return res.status(400).json({ success: false, message: 'recipeIds must be a non-empty array' });
        }

        const quote = await recipeService.getCheckoutQuote(buyerId, recipeIds);
        return sendResponse(res, 200, true, 'Quote calculated successfully', quote);
    } catch (err) {
        next(err);
    }
};

/**
 * Verifies one XRPL transaction and unlocks every payable recipe in the
 * batch under a shared batch_id.
 */
export const unlockRecipesBatch = async (req, res, next) => {
    try {
        const { recipeIds, transactionHash } = req.body;
        const buyerId = req.user.user_id || req.user.id;

        if (!Array.isArray(recipeIds) || recipeIds.length === 0 || !transactionHash) {
            return res.status(400).json({
                success: false,
                message: 'recipeIds (array) and transactionHash are required',
            });
        }

        const result = await recipeService.processBatchRecipeUnlock(buyerId, recipeIds, transactionHash);

        return sendResponse(
            res,
            200,
            true,
            result.alreadyProcessed
                ? 'This payment was already processed.'
                : `Unlocked ${result.unlocked.length} recipe(s) successfully!`,
            result
        );
    } catch (err) {
        if (
            err.message.includes('Insufficient') ||
            err.message.includes('incorrect') ||
            err.message.includes('successful') ||
            err.message.includes('Nothing to unlock') ||
            err.message.includes('could not be found')
        ) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next(err);
    }
};

// src/controllers/recipeController.js

export const getAdminAllRecipes = async (req, res, next) => {
    try {
        // Fetch ALL recipes regardless of status, ordered by newest first
        const { data, error } = await supabase
    .from("recipes")
    .select(`
        *,
        sellers (
            full_name
        )
    `)
    .order("created_at", { ascending: false });

        if (error) throw error;

        // Flatten the nested sellers join so the frontend receives a top-level
        // `full_name` field, consistent with every other recipe endpoint.
        const formattedData = data.map(recipe => ({
            ...recipe,
            full_name: recipe.sellers?.full_name || 'Unassigned Chef',
            sellers: undefined, // remove nested object to keep the shape clean
        }));

        return res.status(200).json({
            success: true,
            message: "All admin recipes fetched successfully",
            data: formattedData
        });
    } catch (error) {
        console.error("Admin Fetch Recipes Error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to fetch recipes for admin" 
        });
    }
};