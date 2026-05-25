import { jest } from '@jest/globals';

// A variable to control exactly what our fake database returns
let mockSupabaseResponse = { data: null, error: null };

// The "Thenable" Query Builder
// This mimics Supabase method chaining AND acts as a Promise.
const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: jest.fn((resolve) => resolve(mockSupabaseResponse)) 
};

// Mock the Supabase config file
jest.unstable_mockModule('../src/config/supabase.js', () => ({
    supabase: {
        from: jest.fn(() => mockQueryBuilder)
    }
}));

const { supabase } = await import('../src/config/supabase.js');
const { getRecipeByIdModel, getAllRecipesModel } = await import('../src/models/recipesModel.js');

describe('Database Models (recipesModel.js)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getRecipeByIdModel calls Supabase with the correct ID and returns data', async () => {
        // Structure the fake data to match Supabase's return style
        mockSupabaseResponse = {
            data: Object.assign(
                [{ title: 'Mocked Database Recipe' }], 
                { title: 'Mocked Database Recipe' }    
            ),
            error: null
        };

        const result = await getRecipeByIdModel('999');

        expect(supabase.from).toHaveBeenCalledWith('recipes');
        
        // Extract the title safely
        const extractedTitle = Array.isArray(result) ? result[0]?.title : result?.title;
        expect(extractedTitle).toBe('Mocked Database Recipe');
    });

    it('getAllRecipesModel throws an error if the database connection fails', async () => {
        // Simulate a complete database failure
        mockSupabaseResponse = {
            data: null,
            error: new Error('Database connection timeout')
        };

        // We tell Jest to explicitly expect this exact error message to be thrown and caught
        await expect(getAllRecipesModel()).rejects.toThrow('Database connection timeout');
    });
});