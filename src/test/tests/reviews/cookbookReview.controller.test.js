import { describe, it, expect, vi, beforeEach } from "vitest";

// buyerController.getMyCookbookRecipeForReview / upsertMyCookbookRecipeReview delegate
// all business logic (ownership, rating validation, duplicate handling) to cookbookService.
// These tests verify the controller wires req -> service -> res correctly, including
// propagating service-thrown statusCode/message for 401/403/400 style failures.

const {
  mockGetCookbookRecipeForReview,
  mockUpsertRecipeReview,
} = vi.hoisted(() => ({
  mockGetCookbookRecipeForReview: vi.fn(),
  mockUpsertRecipeReview: vi.fn(),
}));

vi.mock("../../../services/cookbookService.js", () => ({
  default: {
    getMyCookbook: vi.fn(),
    getCookbookRecipeDetails: vi.fn(),
    getCookbookRecipeForReview: mockGetCookbookRecipeForReview,
    upsertRecipeReview: mockUpsertRecipeReview,
    toggleFavorite: vi.fn(),
  },
}));

vi.mock("../../../services/buyerService.js", () => ({
  default: {
    getBuyerProfile: vi.fn(),
    updateBuyerProfile: vi.fn(),
  },
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn(),
}));

import {
  getMyCookbookRecipeForReview,
  upsertMyCookbookRecipeReview,
} from "../../../controllers/buyerController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("buyerController.getMyCookbookRecipeForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no authenticated buyer is present on the request", async () => {
    const req = { user: undefined, params: { recipeId: "recipe-1" } };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGetCookbookRecipeForReview).not.toHaveBeenCalled();
  });

  it("returns the recipe review data for the owning buyer", async () => {
    mockGetCookbookRecipeForReview.mockResolvedValue({
      recipe_id: "recipe-1",
      title: "Chicken Curry",
      my_feedback: null,
    });

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
    };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(mockGetCookbookRecipeForReview).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      recipe: { recipe_id: "recipe-1", title: "Chicken Curry", my_feedback: null },
    });
  });

  it("propagates a 403 when the service reports the buyer does not own the recipe", async () => {
    const err = new Error("Recipe not found in your cookbook");
    err.statusCode = 403;
    mockGetCookbookRecipeForReview.mockRejectedValue(err);

    const req = {
      user: { user_id: "buyer-2" },
      params: { recipeId: "recipe-1" },
    };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Recipe not found in your cookbook",
    });
  });
});

describe("buyerController.upsertMyCookbookRecipeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no authenticated buyer is present on the request", async () => {
    const req = {
      user: undefined,
      params: { recipeId: "recipe-1" },
      body: { rating: 5 },
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUpsertRecipeReview).not.toHaveBeenCalled();
  });

  it("saves a review and returns the service result for a purchased recipe", async () => {
    mockUpsertRecipeReview.mockResolvedValue({
      feedback: { feedback_id: "fb-1", rating: 5, comment: "Delicious", images: [] },
      rating_avg: 5,
    });

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
      body: { rating: "5", comment: "Delicious" },
      files: [],
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(mockUpsertRecipeReview).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
      rating: "5",
      comment: "Delicious",
      files: [],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, message: "Review saved successfully" })
    );
  });

  it("propagates a 403 when the buyer attempting to review has not purchased the recipe", async () => {
    const err = new Error("Recipe not found in your cookbook");
    err.statusCode = 403;
    mockUpsertRecipeReview.mockRejectedValue(err);

    const req = {
      user: { user_id: "buyer-unauthorized" },
      params: { recipeId: "recipe-1" },
      body: { rating: 5 },
      files: [],
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Recipe not found in your cookbook",
    });
  });

  it("propagates a 400 when the service rejects an out-of-range rating", async () => {
    const err = new Error("Rating must be an integer between 1 and 5");
    err.statusCode = 400;
    mockUpsertRecipeReview.mockRejectedValue(err);

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
      body: { rating: 7 },
      files: [],
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Rating must be an integer between 1 and 5",
    });
  });

  it("defaults to a 500 status when the service throws without a statusCode", async () => {
    mockUpsertRecipeReview.mockRejectedValue(new Error("Unexpected DB failure"));

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
      body: { rating: 5 },
      files: [],
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
