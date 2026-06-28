import { describe, it, expect, vi } from 'vitest';
import { validateRecipe } from '../middleware/inputValidators';

describe('validateRecipe Middleware', () => {

  // Helper function to create a mocked Response object with chainable methods
  const createMockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(), 
      json: vi.fn().mockReturnThis()
    };
    return res as any;
  };

  it('should set status to pending if approval_status is missing', () => {
    const req = { body: { title: 'New Recipe' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    validateRecipe(req, res, next);

    // Verify the middleware logic added the default status
    expect(req.body.approval_status).toBe('pending');
    // Ensure the middleware continues to the next function
    expect(next).toHaveBeenCalled();
  });

  it('should return 400 if validation fails', () => {
    // Providing invalid data to trigger Joi validation error
    const req = { body: { approval_status: 'INVALID_STATUS' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    validateRecipe(req, res, next);

    // Check if the response status was set to 400
    expect(res.status).toHaveBeenCalledWith(400);
    // Ensure next() is NOT called when there is an error
    expect(next).not.toHaveBeenCalled();
  });

  it('should format approval_status correctly (trim and lowercase)', () => {
    const req = { body: { approval_status: '  PUBLISHED  ' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    validateRecipe(req, res, next);

    // Check if the formatting logic works
    expect(req.body.approval_status).toBe('published');
    expect(next).toHaveBeenCalled();
  });
});