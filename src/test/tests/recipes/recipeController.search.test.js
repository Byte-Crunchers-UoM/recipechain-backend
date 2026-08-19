import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetFilteredrecipes,
  mockSearchRecipes,
  mockGetRecipeById,
  mockGetRecipesByChef,
  mockCheckPurchaseStatusModel,
  mockSupabaseSingle,
} = vi.hoisted(() => ({
  mockGetFilteredrecipes: vi.fn(),
  mockSearchRecipes: vi.fn(),
  mockGetRecipeById: vi.fn(),
  mockGetRecipesByChef: vi.fn(),
  mockCheckPurchaseStatusModel: vi.fn(),
  mockSupabaseSingle: vi.fn(),
}));

vi.mock("../../../services/recipeService.js", () => ({
  default: {
    getFilteredrecipes: mockGetFilteredrecipes,
    searchRecipes: mockSearchRecipes,
    getRecipeById: mockGetRecipeById,
    getRecipesByChef: mockGetRecipesByChef,
    getAllRecipes: vi.fn(),
    getTrendingRecipes: vi.fn(),
  },
}));

vi.mock("../../../models/recipesModel.js", () => ({
  checkPurchaseStatusModel: mockCheckPurchaseStatusModel,
}));

// supabase.from(...).select(...).eq(...).single() chain used by getRecipeById
// (admin role check) and a plain select(...).order(...) query used by
// getAdminAllRecipes.
let adminRecipesData = [];
let adminRecipesError = null;

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSupabaseSingle,
        })),
        order: vi.fn(() =>
          Promise.resolve({ data: adminRecipesData, error: adminRecipesError })
        ),
      })),
    })),
  },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn(),
}));

import {
  getFilteredRecipes,
  searchRecipes,
  getRecipeById,
  getAdminAllRecipes,
  getRecipesByChef,
} from "../../../controllers/recipeController.js";

function createMockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockReq(overrides = {}) {
  return {
    query: {},
    params: {},
    body: {},
    user: null,
    ...overrides,
  };
}

describe("recipeController.getFilteredRecipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a cuisine-only filter and forwards it to the service", async () => {
    const req = createMockReq({ query: { cuisine: "italian" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([{ recipe_id: "r1", title: "Pasta" }]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({ cuisine: "italian" }, undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Filtered recipes retrieved successfully",
      data: [{ recipe_id: "r1", title: "Pasta" }],
    });
  });

  it("builds a dietary_tags-only filter", async () => {
    const req = createMockReq({ query: { dietary_tags: "vegan" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([{ recipe_id: "r2" }]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({ dietary_tags: "vegan" }, undefined);
  });

  it("builds a difficulty_level-only filter", async () => {
    const req = createMockReq({ query: { difficulty_level: "Easy" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([{ recipe_id: "r3" }]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({ difficulty_level: "Easy" }, undefined);
  });

  it("combines multiple filters into a single filters object", async () => {
    const req = createMockReq({
      query: {
        cuisine: "italian",
        dietary_tags: "vegan",
        difficulty_level: "Easy",
        meal_type: "dinner",
        occasion: "party",
        goal: "weight-loss",
      },
      user: { user_id: "user-1" },
    });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([{ recipe_id: "r4" }]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith(
      {
        cuisine: "italian",
        dietary_tags: "vegan",
        difficulty_level: "Easy",
        meal_type: "dinner",
        occasion: "party",
        goal: "weight-loss",
      },
      "user-1"
    );
  });

  it("ignores query parameters that are not part of the allowed filter list", async () => {
    const req = createMockReq({ query: { foo: "bar", cuisine: undefined } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({}, undefined);
  });

  it("returns an empty-results message (still 200) when nothing matches", async () => {
    const req = createMockReq({ query: { cuisine: "atlantis" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([]);

    await getFilteredRecipes(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "No recipes found matching your filters",
      data: [],
    });
  });

  it("forwards service errors to next()", async () => {
    const req = createMockReq({ query: { cuisine: "italian" } });
    const res = createMockRes();
    const next = vi.fn();
    const boom = new Error("db exploded");

    mockGetFilteredrecipes.mockRejectedValue(boom);

    await getFilteredRecipes(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("treats a SQL-injection-like cuisine value as opaque data and forwards it unchanged", async () => {
    const malicious = "' OR 1=1--";
    const req = createMockReq({ query: { cuisine: malicious } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({ cuisine: malicious }, undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("treats an XSS-like dietary_tags value as opaque data and forwards it unchanged", async () => {
    const malicious = "<script>alert(1)</script>";
    const req = createMockReq({ query: { dietary_tags: malicious } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetFilteredrecipes.mockResolvedValue([]);

    await getFilteredRecipes(req, res, next);

    expect(mockGetFilteredrecipes).toHaveBeenCalledWith({ dietary_tags: malicious }, undefined);
  });
});

describe("recipeController.searchRecipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("performs an exact-match search and returns the results", async () => {
    const req = createMockReq({ query: { q: "Chicken Curry" } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([{ recipe_id: "r1", title: "Chicken Curry" }]);

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).toHaveBeenCalledWith("Chicken Curry", undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      count: 1,
      data: [{ recipe_id: "r1", title: "Chicken Curry" }],
    });
  });

  it("performs a partial-match search", async () => {
    const req = createMockReq({ query: { q: "chick" } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([
      { recipe_id: "r1", title: "Chicken Curry" },
      { recipe_id: "r2", title: "Chicken Soup" },
    ]);

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).toHaveBeenCalledWith("chick", undefined);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 })
    );
  });

  it("forwards a mixed-case query term unchanged (case-insensitivity is a DB-layer concern)", async () => {
    const req = createMockReq({ query: { q: "ChIcKeN" } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([{ recipe_id: "r1", title: "Chicken Curry" }]);

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).toHaveBeenCalledWith("ChIcKeN", undefined);
  });

  it("returns an empty array immediately without calling the service when q is missing", async () => {
    const req = createMockReq({ query: {} });
    const res = createMockRes();
    const next = vi.fn();

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, count: 0, data: [] });
  });

  it("returns count 0 when the search yields no results", async () => {
    const req = createMockReq({ query: { q: "nonexistent-recipe-xyz" } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([]);

    await searchRecipes(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, count: 0, data: [] });
  });

  it("forwards service errors to next()", async () => {
    const req = createMockReq({ query: { q: "chicken" } });
    const res = createMockRes();
    const next = vi.fn();
    const boom = new Error("search index down");

    mockSearchRecipes.mockRejectedValue(boom);

    await searchRecipes(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it("treats a SQL-injection-like search term as opaque data", async () => {
    const malicious = "' OR 1=1--";
    const req = createMockReq({ query: { q: malicious } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([]);

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).toHaveBeenCalledWith(malicious, undefined);
  });

  it("treats an XSS-like search term as opaque data", async () => {
    const malicious = "<script>alert(1)</script>";
    const req = createMockReq({ query: { q: malicious } });
    const res = createMockRes();
    const next = vi.fn();

    mockSearchRecipes.mockResolvedValue([]);

    await searchRecipes(req, res, next);

    expect(mockSearchRecipes).toHaveBeenCalledWith(malicious, undefined);
  });
});

describe("recipeController.getRecipeById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the recipe does not exist", async () => {
    const req = createMockReq({ params: { id: "missing-id" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue(null);

    await getRecipeById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Recipe not found" });
  });

  it("locks premium content for an anonymous (unauthenticated) request", async () => {
    const req = createMockReq({ params: { id: "r1" }, user: null });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue({
      recipe_id: "r1",
      chef_id: "chef-1",
      ingredients: ["salt"],
      instructions: ["cook"],
      chef_note: "secret note",
    });

    await getRecipeById(req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.recipe.is_premium_locked).toBe(true);
    expect(jsonArg.recipe.ingredients).toBeUndefined();
    expect(jsonArg.recipe.instructions).toBeUndefined();
    expect(jsonArg.recipe.chef_note).toBeUndefined();
  });

  it("grants full access when the requester is the recipe's creator", async () => {
    const req = createMockReq({ params: { id: "r1" }, user: { user_id: "chef-1" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue({
      recipe_id: "r1",
      chef_id: "chef-1",
      ingredients: ["salt"],
      instructions: ["cook"],
      chef_note: "secret note",
    });
    mockCheckPurchaseStatusModel.mockResolvedValue(false);
    mockSupabaseSingle.mockResolvedValue({ data: { role: "buyer" } });

    await getRecipeById(req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.recipe.is_premium_locked).toBe(false);
    expect(jsonArg.recipe.ingredients).toEqual(["salt"]);
  });

  it("grants full access when the requester has purchased the recipe", async () => {
    const req = createMockReq({ params: { id: "r1" }, user: { user_id: "buyer-1" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue({
      recipe_id: "r1",
      chef_id: "chef-1",
      ingredients: ["salt"],
      instructions: ["cook"],
      chef_note: "secret note",
    });
    mockCheckPurchaseStatusModel.mockResolvedValue(true);
    mockSupabaseSingle.mockResolvedValue({ data: { role: "buyer" } });

    await getRecipeById(req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.recipe.is_premium_locked).toBe(false);
  });

  it("grants full access when the requester is an admin", async () => {
    const req = createMockReq({ params: { id: "r1" }, user: { user_id: "admin-1" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue({
      recipe_id: "r1",
      chef_id: "chef-1",
      ingredients: ["salt"],
      instructions: ["cook"],
      chef_note: "secret note",
    });
    mockCheckPurchaseStatusModel.mockResolvedValue(false);
    mockSupabaseSingle.mockResolvedValue({ data: { role: "admin" } });

    await getRecipeById(req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.recipe.is_premium_locked).toBe(false);
  });

  it("locks content for a logged-in buyer who has not purchased and is not admin", async () => {
    const req = createMockReq({ params: { id: "r1" }, user: { user_id: "buyer-2" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipeById.mockResolvedValue({
      recipe_id: "r1",
      chef_id: "chef-1",
      ingredients: ["salt"],
      instructions: ["cook"],
      chef_note: "secret note",
    });
    mockCheckPurchaseStatusModel.mockResolvedValue(false);
    mockSupabaseSingle.mockResolvedValue({ data: { role: "buyer" } });

    await getRecipeById(req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.recipe.is_premium_locked).toBe(true);
    expect(jsonArg.recipe.ingredients).toBeUndefined();
  });

  it("forwards service errors (e.g. invalid id format) to next()", async () => {
    const req = createMockReq({ params: { id: "not-a-valid-uuid" } });
    const res = createMockRes();
    const next = vi.fn();
    const boom = new Error("invalid input syntax for type uuid");

    mockGetRecipeById.mockRejectedValue(boom);

    await getRecipeById(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe("recipeController.getAdminAllRecipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminRecipesData = [];
    adminRecipesError = null;
  });

  it("flattens seller info and returns all recipes regardless of status", async () => {
    adminRecipesData = [
      { recipe_id: "r1", status: "draft", sellers: { full_name: "Chef A" } },
      { recipe_id: "r2", status: "active", sellers: null },
    ];

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await getAdminAllRecipes(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data[0].full_name).toBe("Chef A");
    expect(jsonArg.data[0].sellers).toBeUndefined();
    expect(jsonArg.data[1].full_name).toBe("Unassigned Chef");
  });

  it("returns a controlled 500 (no stack trace) when the query fails", async () => {
    adminRecipesError = new Error("connection refused at 10.0.0.5:5432");

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await getAdminAllRecipes(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg).toEqual({
      success: false,
      message: "Failed to fetch recipes for admin",
    });
    expect(JSON.stringify(jsonArg)).not.toContain("10.0.0.5");
  });
});

describe("recipeController.getRecipesByChef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the recipes published by a given chef", async () => {
    const req = createMockReq({ params: { id: "chef-1" } });
    const res = createMockRes();
    const next = vi.fn();

    mockGetRecipesByChef.mockResolvedValue([{ recipe_id: "r1", chef_id: "chef-1" }]);

    await getRecipesByChef(req, res, next);

    expect(mockGetRecipesByChef).toHaveBeenCalledWith("chef-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Chef recipes fetched successfully",
      data: [{ recipe_id: "r1", chef_id: "chef-1" }],
    });
  });

  it("forwards a 'Chef ID is required' service error to next()", async () => {
    const req = createMockReq({ params: {} });
    const res = createMockRes();
    const next = vi.fn();
    const boom = new Error("Chef ID is required");

    mockGetRecipesByChef.mockRejectedValue(boom);

    await getRecipesByChef(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
