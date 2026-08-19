import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCookbookRecipeForReview, mockUpsertRecipeReview } = vi.hoisted(() => ({
  mockGetCookbookRecipeForReview: vi.fn(),
  mockUpsertRecipeReview: vi.fn()
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: vi.fn() }
}));

vi.mock("../../../services/buyerService.js", () => ({
  default: { getBuyerProfile: vi.fn(), updateBuyerProfile: vi.fn() }
}));

vi.mock("../../../services/cookbookService.js", () => ({
  default: {
    getCookbookRecipeForReview: mockGetCookbookRecipeForReview,
    upsertRecipeReview: mockUpsertRecipeReview
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn()
}));

import {
  getMyCookbookRecipeForReview,
  upsertMyCookbookRecipeReview
} from "../../../controllers/buyerController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buyerController.getMyCookbookRecipeForReview", () => {
  it("returns 401 when there is no authenticated session", async () => {
    const req = { user: null, params: { recipeId: "recipe-1" } };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGetCookbookRecipeForReview).not.toHaveBeenCalled();
  });

  it("returns the recipe review page data for the owning buyer", async () => {
    mockGetCookbookRecipeForReview.mockResolvedValue({
      recipe_id: "recipe-1",
      my_feedback: null
    });

    const req = { user: { user_id: "buyer-1" }, params: { recipeId: "recipe-1" } };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(mockGetCookbookRecipeForReview).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      recipeId: "recipe-1"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      recipe: { recipe_id: "recipe-1", my_feedback: null }
    });
  });

  it("propagates the 403 from the service when the buyer has not purchased the recipe", async () => {
    const err = new Error("Recipe not found in your cookbook");
    err.statusCode = 403;
    mockGetCookbookRecipeForReview.mockRejectedValue(err);

    const req = { user: { user_id: "buyer-2" }, params: { recipeId: "recipe-1" } };
    const res = createMockResponse();

    await getMyCookbookRecipeForReview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Recipe not found in your cookbook"
    });
  });
});

describe("buyerController.upsertMyCookbookRecipeReview", () => {
  it("returns 401 when there is no authenticated session", async () => {
    const req = { user: null, params: { recipeId: "recipe-1" }, body: { rating: 5 } };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUpsertRecipeReview).not.toHaveBeenCalled();
  });

  it("saves a review and defaults files to an empty array when req.files is absent", async () => {
    mockUpsertRecipeReview.mockResolvedValue({
      feedback: { feedback_id: "fb-1", rating: 5 },
      rating_avg: 5
    });

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
      body: { rating: 5, comment: "Great" }
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(mockUpsertRecipeReview).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
      rating: 5,
      comment: "Great",
      files: []
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a review from a buyer who never purchased the recipe (service-enforced)", async () => {
    const err = new Error("Recipe not found in your cookbook");
    err.statusCode = 403;
    mockUpsertRecipeReview.mockRejectedValue(err);

    const req = {
      user: { user_id: "buyer-2" },
      params: { recipeId: "recipe-1" },
      body: { rating: 5, comment: "Great" }
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Recipe not found in your cookbook"
    });
  });

  it("returns the service's validation status code for an out-of-range rating", async () => {
    const err = new Error("Rating must be an integer between 1 and 5");
    err.statusCode = 400;
    mockUpsertRecipeReview.mockRejectedValue(err);

    const req = {
      user: { user_id: "buyer-1" },
      params: { recipeId: "recipe-1" },
      body: { rating: 9, comment: "" }
    };
    const res = createMockResponse();

    await upsertMyCookbookRecipeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
