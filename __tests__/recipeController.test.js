import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// 1. Mock the Service so we don't accidentally trigger real XRPL transactions!
jest.unstable_mockModule('../src/services/recipeService.js', () => ({
    default: {
        processRecipeUnlock: jest.fn()
    }
}));

const recipeServiceModule = await import('../src/services/recipeService.js');
const recipeService = recipeServiceModule.default;
const { unlockRecipe } = await import('../src/controllers/recipeController.js');

// 2. Setup a fake Express server for testing
const app = express();
app.use(express.json()); // Allows Express to parse JSON bodies

// Fake middleware to simulate a logged-in user making the request
app.post('/api/unlock', (req, res, next) => {
    req.user = { user_id: 'test-buyer-123' };
    next();
}, unlockRecipe);

describe('POST /api/unlock Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 400 Bad Request if recipeId or transactionHash is missing', async () => {
        // Send a request missing the transactionHash
        const response = await request(app)
            .post('/api/unlock')
            .send({ recipeId: 'recipe-123' }); 

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/recipeId and transactionHash are required/);
        // Ensure the service was NEVER called because validation failed early
        expect(recipeService.processRecipeUnlock).not.toHaveBeenCalled();
    });

    it('returns 200 OK when payment is processed successfully', async () => {
        // Force the mock service to resolve successfully
        recipeService.processRecipeUnlock.mockResolvedValue(true);

        const response = await request(app)
            .post('/api/unlock')
            .send({ recipeId: 'recipe-123', transactionHash: 'ABCDEFG12345' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toMatch(/unlocked and payment recorded/);
        
        // Verify the controller passed the correct data down to the service
        expect(recipeService.processRecipeUnlock).toHaveBeenCalledWith(
            'test-buyer-123', 
            'recipe-123', 
            'ABCDEFG12345'
        );
    });

    it('catches specific XRPL service errors and returns a 400', async () => {
        // Simulate the service throwing an "Insufficient funds" error
        recipeService.processRecipeUnlock.mockRejectedValue(new Error('Insufficient payment amount.'));

        const response = await request(app)
            .post('/api/unlock')
            .send({ recipeId: 'recipe-123', transactionHash: 'BAD-HASH' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/Insufficient payment/);
    });
});