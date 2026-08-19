import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateRecipe } from "../../../middleware/inputValidators.js";

// Part 1: src/middleware/inputValidators.js validateRecipe (Joi schema) — the ACTUAL
// required-field / price-validation gate that runs before recipeController.addRecipe.
// Note this middleware is only wired on POST / (create) in src/routes/recipeRoutes.js
// (`router.post('/', validateRecipe, addRecipe)`); PUT /:id (update) has NO validation
// middleware at all — see the "update path has no validation" test below.

function createMockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("validateRecipe middleware (Joi schema) — required fields / price validation", () => {
  it("rejects a non-draft submission missing required fields (title, price, etc.)", () => {
    const req = { body: { approval_status: "pending" } };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.missingFields).toEqual(expect.arrayContaining(["title", "price"]));
  });

  it("rejects a negative price on a non-draft submission", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: -5,
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ name: "Chicken", quantity: "1", unit: "kg" }],
        instructions: ["Cook it"],
        approval_status: "pending",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].missingFields).toContain("price");
  });

  it("rejects a non-numeric price on a non-draft submission", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: "free",
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ name: "Chicken", quantity: "1", unit: "kg" }],
        instructions: ["Cook it"],
        approval_status: "pending",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].missingFields).toContain("price");
  });

  it("allows a draft submission with price/description/etc. omitted", () => {
    const req = {
      body: {
        title: "Draft Recipe Idea",
        approval_status: "draft",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts a fully-populated non-draft submission with a valid positive price", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: 5,
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ name: "Chicken", quantity: "1", unit: "kg" }],
        instructions: ["Cook it"],
        approval_status: "pending",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("defaults missing approval_status to 'pending' (non-draft validation rules apply)", () => {
    const req = { body: { title: "Chicken Curry" } };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(req.body.approval_status).toBe("pending");
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("FINDING: validateRecipe is never applied on the update route, so PUT /:id accepts a negative price unchecked", () => {
    // src/routes/recipeRoutes.js: `router.put('/:id', updateRecipe);` has no validateRecipe
    // (or any other) middleware. This test documents that calling the raw validator against
    // an update-shaped payload WOULD reject a negative price if it were wired in — proving
    // the gap is a routing omission, not a schema gap.
    const req = {
      body: { title: "Chicken Curry", price: -10, approval_status: "published" },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    // Yet recipeRoutes.js never calls validateRecipe for PUT /:id, so in the real app
    // this rejection never happens on update — see recipeController.crud.test.js findings.
  });
});

// Part 2: recipeService.updateRecipe/deleteRecipe backing logic, including the
// trending_recipes upsert side-effect documented in CLAUDE.md (updateRecipe also
// upserts a row into trending_recipes via upsertTrendingRecipeModel after every edit).

const {
  mockUpdateRecipeModel,
  mockDeleteRecipeModel,
  mockGetChefIdByRecipeIdModel,
  mockGetBuyerCountByRecipeIdModel,
  mockUpsertTrendingRecipeModel,
  mockAddRecipeModel,
} = vi.hoisted(() => ({
  mockUpdateRecipeModel: vi.fn(),
  mockDeleteRecipeModel: vi.fn(),
  mockGetChefIdByRecipeIdModel: vi.fn(),
  mockGetBuyerCountByRecipeIdModel: vi.fn(),
  mockUpsertTrendingRecipeModel: vi.fn(),
  mockAddRecipeModel: vi.fn(),
}));

vi.mock("../../../models/recipesModel.js", () => ({
  addRecipeModel: mockAddRecipeModel,
  getRecipeByIdModel: vi.fn(),
  updateRecipeModel: mockUpdateRecipeModel,
  deleteRecipeModel: mockDeleteRecipeModel,
  getAllRecipesModel: vi.fn(),
  getAllRecipesForTrendingModel: vi.fn(),
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
  upsertTrendingRecipeModel: mockUpsertTrendingRecipeModel,
  bulkUpsertTrendingRecipesModel: vi.fn(),
  getTrendingFromTableModel: vi.fn(),
  getAllFeedbacksModel: vi.fn(),
  getAllPurchasesModel: vi.fn(),
  getChefIdByRecipeIdModel: mockGetChefIdByRecipeIdModel,
  getBuyerCountByRecipeIdModel: mockGetBuyerCountByRecipeIdModel,
  getRecipesByChefIdModel: vi.fn(),
}));

vi.mock("../../../services/vectorService.js", () => ({
  embedAndStoreRecipe: vi.fn(),
}));

vi.mock("../../../services/xrplService.js", () => ({
  default: { sendXrpFromTreasury: vi.fn() },
}));

vi.mock("../../../services/walletService.js", () => ({
  default: { ensurePurchaseLedgerEntry: vi.fn() },
}));

import recipeService from "../../../services/recipeService.js";

describe("recipeService.updateRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the recipe row and upserts a trending_recipes row via upsertTrendingRecipeModel", async () => {
    mockUpdateRecipeModel.mockResolvedValue({
      recipe_id: "recipe-1",
      title: "Updated Title",
      created_at: "2026-01-01T00:00:00.000Z",
      average_rating: 4.5,
    });
    mockGetChefIdByRecipeIdModel.mockResolvedValue("seller-1");
    mockGetBuyerCountByRecipeIdModel.mockResolvedValue(3);

    const result = await recipeService.updateRecipe("recipe-1", { title: "Updated Title" });

    expect(mockUpdateRecipeModel).toHaveBeenCalledWith("recipe-1", { title: "Updated Title" });
    expect(mockUpsertTrendingRecipeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe_id: "recipe-1",
        chef_id: "seller-1",
        purchase_count: 3,
      })
    );
    expect(result.recipe_id).toBe("recipe-1");
  });

  it("does NOT check that the update target's chef_id matches any caller identity (no ownership param exists in the service signature)", async () => {
    // recipeService.updateRecipe(id, updateData) — there is no callerId/sellerId parameter
    // anywhere in this method. Ownership, if it were to be enforced, would have to happen
    // in the controller (which also does not do it — see recipeController.crud.test.js).
    mockUpdateRecipeModel.mockResolvedValue({
      recipe_id: "recipe-1",
      chef_id: "seller-1", // real owner
      title: "Changed by someone else",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    mockGetChefIdByRecipeIdModel.mockResolvedValue("seller-1");
    mockGetBuyerCountByRecipeIdModel.mockResolvedValue(0);

    const result = await recipeService.updateRecipe("recipe-1", {
      title: "Changed by someone else",
    });

    expect(mockUpdateRecipeModel).toHaveBeenCalledWith("recipe-1", {
      title: "Changed by someone else",
    });
    expect(result.title).toBe("Changed by someone else");
  });
});

describe("recipeService.deleteRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the recipe by id with no ownership parameter in the service signature", async () => {
    mockDeleteRecipeModel.mockResolvedValue(true);

    const result = await recipeService.deleteRecipe("recipe-1");

    expect(mockDeleteRecipeModel).toHaveBeenCalledWith("recipe-1");
    expect(result).toBe(true);
  });
});

describe("recipeService.addRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the prepared recipe payload straight to addRecipeModel", async () => {
    mockAddRecipeModel.mockResolvedValue({
      recipe: { recipe_id: "recipe-new", title: "New Recipe" },
      tag: null,
    });

    const result = await recipeService.addRecipe({ title: "New Recipe", price: 5 });

    expect(mockAddRecipeModel).toHaveBeenCalledWith({ title: "New Recipe", price: 5 });
    expect(result.recipe.recipe_id).toBe("recipe-new");
  });
});
