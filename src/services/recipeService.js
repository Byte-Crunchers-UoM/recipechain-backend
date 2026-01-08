import {
    createRecipeModel,
    getRecipeByIdModel,
    getAllRecipesModel,
    updateRecipeModel,
    deleteRecipeModel
} from '../models/recipeModel.js';
import { getUserByIdModel } from '../models/userModel.js';

class RecipeService {

    async createRecipe(recipeData) {
        const { title, description, ingredients, instructions, userId } = recipeData;

        // Verify user exists
        const user = await getUserByIdModel(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Map to DB columns
        const payload = {
            title,
            description,
            ingredients, // Supabase/Postgres handling JSONB array automatically from JS array
            instructions,
            user_id: userId
        };

        const newRecipe = await createRecipeModel(payload);
        return newRecipe;
    }

    async getRecipeById(id) {
        if (!id || isNaN(id)) {
            throw new Error('Invalid recipe ID');
        }

        const recipe = await getRecipeByIdModel(id);
        return recipe;
    }

    async getAllRecipes() {
        return await getAllRecipesModel();
    }

    async updateRecipe(id, updates) {
        if (!id || isNaN(id)) {
            throw new Error('Invalid recipe ID');
        }

        // Check if recipe exists
        const existingRecipe = await getRecipeByIdModel(id);
        if (!existingRecipe) {
            return null;
        }

        // Maps updates to DB columns if necessary. 
        // Assuming 'updates' comes from body and matches keys except userId -> user_id
        const dbUpdates = { ...updates };
        if (dbUpdates.userId) {
            // Verify user if changing owner
            const user = await getUserByIdModel(dbUpdates.userId);
            if (!user) throw new Error('User not found');

            dbUpdates.user_id = dbUpdates.userId;
            delete dbUpdates.userId;
        }

        // We can also update updated_at here if we want manual control, 
        // but better to let DB handle it via trigger or just pass new Date().
        dbUpdates.updated_at = new Date();

        const updatedRecipe = await updateRecipeModel(id, dbUpdates);
        return updatedRecipe;
    }

    async deleteRecipe(id) {
        if (!id || isNaN(id)) {
            throw new Error('Invalid recipe ID');
        }

        const existingRecipe = await getRecipeByIdModel(id);
        if (!existingRecipe) {
            throw new Error('Recipe not found');
        }

        await deleteRecipeModel(id);
        return { message: 'Recipe deleted successfully' };
    }
}

export default new RecipeService();
