import { jest } from '@jest/globals';

// 1. Fully mock the models file so we bypass Supabase
jest.unstable_mockModule('../src/models/recipesModel.js', () => ({
    getRecipeByIdModel: jest.fn(),
    addRecipeModel: jest.fn(),
    getAllRecipesModel: jest.fn(),
    getFilteredRecipesModel: jest.fn(),
    searchRecipesModel: jest.fn(),
    updateRecipeModel: jest.fn(),
    deleteRecipeModel: jest.fn(),
    getRecipeWithSellerModel: jest.fn(),
    savePaymentRecordModel: jest.fn(),
    saveRecipePurchaseModel: jest.fn(),
    getSellerWalletModel: jest.fn(),
    checkPurchaseStatusModel: jest.fn(),
    getUserPurchasesModel: jest.fn()
}));

const recipesModel = await import('../src/models/recipesModel.js');

// 2. Destructure the default export to correctly target your instantiated class
const { default: recipeService } = await import('../src/services/recipeService.js'); 

describe('RecipeService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully fetch a recipe by ID', async () => {
        const mockRecipeId = '123-uuid';
        
        const mockDbData = {
            recipe_id: mockRecipeId,
            title: 'Thai Green Curry',
            price: 2.5,
            sellers: { full_name: 'Gordon Ramsay' }
        };

        recipesModel.getRecipeByIdModel.mockResolvedValue(mockDbData);

        const result = await recipeService.getRecipeById(mockRecipeId);

        expect(result).toBeDefined();
        expect(result.title).toBe('Thai Green Curry');
        expect(recipesModel.getRecipeByIdModel).toHaveBeenCalledWith(mockRecipeId);
        expect(recipesModel.getRecipeByIdModel).toHaveBeenCalledTimes(1);
    });

    it('should return null if recipe is not found', async () => {
        recipesModel.getRecipeByIdModel.mockResolvedValue(null);

        const result = await recipeService.getRecipeById('bad-id');

        expect(result).toBeNull();
    });
});