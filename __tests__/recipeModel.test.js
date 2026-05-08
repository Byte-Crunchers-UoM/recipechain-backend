import { jest } from '@jest/globals';

// 1. Create mock functions for the Supabase chain
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();

// 2. Mock the Supabase config file (UPDATE THIS PATH 👇)
jest.unstable_mockModule('../src/config/supabase.js', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: mockSelect.mockReturnThis(),
            eq: mockEq.mockReturnThis(),
            single: mockSingle.mockReturnThis(),
            order: mockOrder.mockReturnThis()
        }))
    }
}));

// 3. Import the mocked file (UPDATE THIS PATH 👇)
const { supabase } = await import('../src/config/supabase.js');
const { getRecipeByIdModel, getAllRecipesModel } = await import('../src/models/recipesModel.js');

describe('Database Models (recipesModel.js)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getRecipeByIdModel calls Supabase with the correct ID and returns data', async () => {
        const fakeSupabaseResponse = {
            data: { recipe_id: '999', title: 'Mocked Database Recipe' },
            error: null
        };

        mockSingle.mockResolvedValue(fakeSupabaseResponse);

        const result = await getRecipeByIdModel('999');

        expect(supabase.from).toHaveBeenCalledWith('recipes');
        expect(mockSelect).toHaveBeenCalledWith('*, sellers(full_name)');
        expect(mockEq).toHaveBeenCalledWith('recipe_id', '999');
        expect(result.title).toBe('Mocked Database Recipe');
    });

    it('getAllRecipesModel throws an error if the database connection fails', async () => {
        const fakeSupabaseError = {
            data: null,
            error: new Error('Database connection timeout')
        };

        mockOrder.mockResolvedValue(fakeSupabaseError);

        await expect(getAllRecipesModel()).rejects.toThrow('Database connection timeout');
    });
});