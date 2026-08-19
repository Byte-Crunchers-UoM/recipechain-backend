import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockGetAllRecipesForTrendingModel,
  mockGetAllFeedbacksModel,
  mockGetAllPurchasesModel,
  mockBulkUpsertTrendingRecipesModel,
  mockGetTrendingFromTableModel,
} = vi.hoisted(() => ({
  mockGetAllRecipesForTrendingModel: vi.fn(),
  mockGetAllFeedbacksModel: vi.fn(),
  mockGetAllPurchasesModel: vi.fn(),
  mockBulkUpsertTrendingRecipesModel: vi.fn(),
  mockGetTrendingFromTableModel: vi.fn(),
}));

vi.mock("../../../models/recipesModel.js", () => ({
  addRecipeModel: vi.fn(),
  getRecipeByIdModel: vi.fn(),
  updateRecipeModel: vi.fn(),
  deleteRecipeModel: vi.fn(),
  getAllRecipesModel: vi.fn(),
  getAllRecipesForTrendingModel: mockGetAllRecipesForTrendingModel,
  getFilteredRecipesModel: vi.fn(),
  searchRecipesModel: vi.fn(),
  getRecipeWithSellerModel: vi.fn(),
  savePaymentRecordModel: vi.fn(),
  saveRecipePurchaseModel: vi.fn(),
  getSellerWalletModel: vi.fn(),
  getUserPurchasesModel: vi.fn(),
  getRecipesByIdsModel: vi.fn(),
  getPurchasedRecipeIdsModel: vi.fn(),
  getExistingPaymentByHashModel: vi.fn(),
  savePaymentItemsModel: vi.fn(),
  verifyRecipeModel: vi.fn(),
  upsertTrendingRecipeModel: vi.fn(),
  bulkUpsertTrendingRecipesModel: mockBulkUpsertTrendingRecipesModel,
  getTrendingFromTableModel: mockGetTrendingFromTableModel,
  getAllFeedbacksModel: mockGetAllFeedbacksModel,
  getAllPurchasesModel: mockGetAllPurchasesModel,
  getChefIdByRecipeIdModel: vi.fn(),
  getBuyerCountByRecipeIdModel: vi.fn(),
  getRecipesByChefIdModel: vi.fn(),
}));

vi.mock("../../../services/vectorService.js", () => ({
  embedAndStoreRecipe: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));

import recipeService from "../../../services/recipeService.js";

describe("recipeService._calculateRecipeScore (real formula)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when given a falsy recipe", () => {
    expect(recipeService._calculateRecipeScore(null)).toBeNull();
  });

  it("zeroes the heat score for recipes rated below 2.0, but preserves other metrics", () => {
    const recipe = {
      recipe_id: "low-rated",
      average_rating: 1.5,
      rating_count: 4,
      buys: 10,
      created_at: new Date().toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    expect(result.heat_score).toBe(0);
    expect(result.purchase_count).toBe(10);
    expect(result.recipe_id).toBe("low-rated");
  });

  it("does NOT zero the score at exactly 2.0 (boundary is exclusive, '< 2.0')", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const recipe = {
      recipe_id: "boundary",
      average_rating: 2.0,
      rating_count: 5,
      buys: 3,
      created_at: new Date().toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    expect(result.heat_score).toBeGreaterThan(0);
  });

  it("computes the heat score using the documented formula: "
    + "score = 4.9*(1 - e^(-raw/20)) + noise, "
    + "raw = (buys*10 + avgRating*ratingCount*20) / (ageHours+2)^1.5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // noise = 0.5 * 0.09 = 0.045

    const createdAt = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours ago
    const recipe = {
      recipe_id: "formula-check",
      average_rating: 4,
      rating_count: 10,
      buys: 5,
      created_at: createdAt.toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    const numerator = 5 * 10 + 4 * 10 * 20; // 850
    const denominator = Math.pow(10 + 2, 1.5); // 12^1.5
    const rawScore = numerator / denominator;
    const expectedBase = 4.9 * (1 - Math.exp(-rawScore / 20));
    const expectedScore = expectedBase + 0.5 * 0.09;

    expect(result.heat_score).toBeCloseTo(expectedScore, 6);
    expect(result.purchase_count).toBe(5);
  });

  it("keeps the score strictly below 5 (asymptotic scale) even for huge inputs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const recipe = {
      recipe_id: "huge",
      average_rating: 5,
      rating_count: 100000,
      buys: 100000,
      created_at: new Date().toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    expect(result.heat_score).toBeLessThan(5);
  });

  it("gives a newer recipe a higher score than an older recipe with identical buys/ratings", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const base = { average_rating: 4, rating_count: 10, buys: 5 };

    const newer = recipeService._calculateRecipeScore({
      ...base,
      recipe_id: "newer",
      created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    });
    const older = recipeService._calculateRecipeScore({
      ...base,
      recipe_id: "older",
      created_at: new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString(),
    });

    expect(newer.heat_score).toBeGreaterThan(older.heat_score);
  });

  it("treats recipe.buys as an array length when buys is an array (e.g. raw purchase rows)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const recipe = {
      recipe_id: "array-buys",
      average_rating: 3,
      rating_count: 2,
      buys: ["p1", "p2", "p3"],
      created_at: new Date().toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    expect(result.purchase_count).toBe(3);
  });

  it("treats a rating of exactly 0 (no ratings yet) as not triggering the low-rating zero-out", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const recipe = {
      recipe_id: "no-ratings",
      average_rating: 0,
      rating_count: 0,
      buys: 8,
      created_at: new Date().toISOString(),
    };

    const result = recipeService._calculateRecipeScore(recipe);

    // avgRating > 0 is false, so the "< 2.0" zero-out branch is skipped entirely;
    // score is computed from buys alone.
    expect(result.heat_score).toBeGreaterThan(0);
  });
});

describe("recipeService.getTrendingRecipes (end-to-end aggregation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("excludes recipes with zero purchases from the trending set", async () => {
    mockGetAllRecipesForTrendingModel.mockResolvedValue([
      { recipe_id: "no-purchases", chef_id: "chef-1", created_at: new Date().toISOString() },
      { recipe_id: "has-purchases", chef_id: "chef-2", created_at: new Date().toISOString() },
    ]);
    mockGetAllFeedbacksModel.mockResolvedValue([
      { recipe_id: "has-purchases", rating: 5 },
    ]);
    mockGetAllPurchasesModel.mockResolvedValue([
      { recipe_id: "has-purchases", unlocked_at: new Date().toISOString() },
    ]);
    mockBulkUpsertTrendingRecipesModel.mockResolvedValue([]);
    mockGetTrendingFromTableModel.mockResolvedValue([
      {
        recipe_id: "has-purchases",
        heat_score: 1.2,
        purchase_count: 1,
        rating_avg: 5,
        created_at: new Date().toISOString(),
        recipes: { recipe_id: "has-purchases", title: "Winner", sellers: { full_name: "Chef Two" } },
      },
    ]);

    const result = await recipeService.getTrendingRecipes(10, null);

    expect(mockBulkUpsertTrendingRecipesModel).toHaveBeenCalledTimes(1);
    const upsertPayload = mockBulkUpsertTrendingRecipesModel.mock.calls[0][0];
    expect(upsertPayload).toHaveLength(1);
    expect(upsertPayload[0].recipe_id).toBe("has-purchases");

    expect(result).toHaveLength(1);
    expect(result[0].recipe_id).toBe("has-purchases");
    expect(result[0].chef_name).toBe("Chef Two");
  });

  it("excludes a purchased-but-low-rated (<2.0) recipe entirely, since its heat score zeroes out", async () => {
    mockGetAllRecipesForTrendingModel.mockResolvedValue([
      { recipe_id: "low-rated-purchased", chef_id: "chef-1", created_at: new Date().toISOString() },
    ]);
    mockGetAllFeedbacksModel.mockResolvedValue([
      { recipe_id: "low-rated-purchased", rating: 1 },
    ]);
    mockGetAllPurchasesModel.mockResolvedValue([
      { recipe_id: "low-rated-purchased", unlocked_at: new Date().toISOString() },
      { recipe_id: "low-rated-purchased", unlocked_at: new Date().toISOString() },
    ]);
    mockBulkUpsertTrendingRecipesModel.mockResolvedValue([]);
    mockGetTrendingFromTableModel.mockResolvedValue([]);

    await recipeService.getTrendingRecipes(10, null);

    const upsertPayload = mockBulkUpsertTrendingRecipesModel.mock.calls[0][0];
    expect(upsertPayload).toHaveLength(0);
  });

  it("filters the final list by category, matching either category or difficulty_level (case-insensitive)", async () => {
    mockGetAllRecipesForTrendingModel.mockResolvedValue([
      { recipe_id: "r1", chef_id: "chef-1", created_at: new Date().toISOString() },
      { recipe_id: "r2", chef_id: "chef-2", created_at: new Date().toISOString() },
    ]);
    mockGetAllFeedbacksModel.mockResolvedValue([]);
    mockGetAllPurchasesModel.mockResolvedValue([
      { recipe_id: "r1", unlocked_at: new Date().toISOString() },
      { recipe_id: "r2", unlocked_at: new Date().toISOString() },
    ]);
    mockBulkUpsertTrendingRecipesModel.mockResolvedValue([]);
    mockGetTrendingFromTableModel.mockResolvedValue([
      {
        recipe_id: "r1",
        heat_score: 1,
        purchase_count: 1,
        rating_avg: 0,
        created_at: new Date().toISOString(),
        recipes: { recipe_id: "r1", title: "Easy Dish", difficulty_level: "Easy" },
      },
      {
        recipe_id: "r2",
        heat_score: 1,
        purchase_count: 1,
        rating_avg: 0,
        created_at: new Date().toISOString(),
        recipes: { recipe_id: "r2", title: "Hard Dish", difficulty_level: "Hard" },
      },
    ]);

    const result = await recipeService.getTrendingRecipes(10, "easy");

    expect(result).toHaveLength(1);
    expect(result[0].recipe_id).toBe("r1");
  });

  it("returns the full list unfiltered when category is 'all'", async () => {
    mockGetAllRecipesForTrendingModel.mockResolvedValue([]);
    mockGetAllFeedbacksModel.mockResolvedValue([]);
    mockGetAllPurchasesModel.mockResolvedValue([]);
    mockBulkUpsertTrendingRecipesModel.mockResolvedValue([]);
    mockGetTrendingFromTableModel.mockResolvedValue([
      {
        recipe_id: "r1",
        heat_score: 1,
        purchase_count: 1,
        rating_avg: 0,
        created_at: new Date().toISOString(),
        recipes: { recipe_id: "r1", title: "Any Dish", difficulty_level: "Easy" },
      },
    ]);

    const result = await recipeService.getTrendingRecipes(10, "all");

    expect(result).toHaveLength(1);
  });

  it("propagates errors from the model layer instead of swallowing them", async () => {
    const boom = new Error("supabase timeout");
    mockGetAllRecipesForTrendingModel.mockRejectedValue(boom);
    mockGetAllFeedbacksModel.mockResolvedValue([]);
    mockGetAllPurchasesModel.mockResolvedValue([]);

    await expect(recipeService.getTrendingRecipes(10, null)).rejects.toThrow("supabase timeout");
  });

  it("drops joined rows whose linked recipe record is missing", async () => {
    mockGetAllRecipesForTrendingModel.mockResolvedValue([]);
    mockGetAllFeedbacksModel.mockResolvedValue([]);
    mockGetAllPurchasesModel.mockResolvedValue([]);
    mockBulkUpsertTrendingRecipesModel.mockResolvedValue([]);
    mockGetTrendingFromTableModel.mockResolvedValue([
      { recipe_id: "orphan", heat_score: 1, purchase_count: 1, rating_avg: 0, recipes: null },
    ]);

    const result = await recipeService.getTrendingRecipes(10, null);

    expect(result).toHaveLength(0);
  });
});
