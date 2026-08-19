import { describe, it, expect, vi, beforeEach } from "vitest";

// recipeController create/update/delete + verify + getRecipesByChef, backed by recipeService.
//
// KEY FINDING (see also recipeService.crud.test.js and the report):
// Neither the controller (src/controllers/recipeController.js updateRecipe/deleteRecipe)
// nor the route layer (src/routes/recipeRoutes.js: `router.put('/:id', updateRecipe)` and
// `router.delete('/:id', deleteRecipe)`) apply any auth middleware or ownership check.
// updateRecipe/deleteRecipe take req.params.id and blindly forward to
// recipeService.updateRecipe/deleteRecipe with no comparison against req.user/req.session.
// This means ANY caller (even unauthenticated) can edit or delete ANY seller's recipe by ID.
// The tests below capture this ACTUAL (unsafe) behavior rather than assuming a check exists.

const {
  mockAddRecipe,
  mockUpdateRecipe,
  mockDeleteRecipe,
  mockVerifyRecipe,
  mockGetRecipesByChef,
} = vi.hoisted(() => ({
  mockAddRecipe: vi.fn(),
  mockUpdateRecipe: vi.fn(),
  mockDeleteRecipe: vi.fn(),
  mockVerifyRecipe: vi.fn(),
  mockGetRecipesByChef: vi.fn(),
}));

vi.mock("../../../services/recipeService.js", () => ({
  default: {
    addRecipe: mockAddRecipe,
    updateRecipe: mockUpdateRecipe,
    deleteRecipe: mockDeleteRecipe,
    verifyRecipe: mockVerifyRecipe,
    getRecipesByChef: mockGetRecipesByChef,
    getAllRecipes: vi.fn(),
    getFilteredrecipes: vi.fn(),
    searchRecipes: vi.fn(),
    getRecipeById: vi.fn(),
  },
}));

vi.mock("../../../models/recipesModel.js", () => ({
  checkPurchaseStatusModel: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn(),
}));

import {
  addRecipe,
  updateRecipe,
  deleteRecipe,
  verifyRecipe,
  getRecipesByChef,
} from "../../../controllers/recipeController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("recipeController.addRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a recipe and forces status='draft' regardless of caller-supplied status", async () => {
    mockAddRecipe.mockResolvedValue({
      recipe: { recipe_id: "recipe-1", title: "Chicken Curry", status: "draft" },
      tag: null,
    });

    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: 5,
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [],
        instructions: [],
        approval_status: "published",
        chef_id: "seller-1",
      },
      user: { id: "seller-1" },
      file: null,
    };
    const res = createMockResponse();
    const next = vi.fn();

    await addRecipe(req, res, next);

    expect(mockAddRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Chicken Curry",
        approval_status: "pending",
        status: "draft",
        chef_id: "seller-1",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes errors to next() rather than crashing", async () => {
    mockAddRecipe.mockRejectedValue(new Error("DB insert failed"));

    const req = { body: { title: "Broken" }, user: { id: "seller-1" }, file: null };
    const res = createMockResponse();
    const next = vi.fn();

    await addRecipe(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("recipeController.updateRecipe — ownership check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a recipe owned by the requesting seller", async () => {
    mockUpdateRecipe.mockResolvedValue({
      recipe_id: "recipe-1",
      title: "Updated Title",
      chef_id: "seller-1",
    });

    const req = {
      params: { id: "recipe-1" },
      body: { title: "Updated Title" },
      user: { id: "seller-1", user_id: "seller-1" },
    };
    const res = createMockResponse();
    const next = vi.fn();

    await updateRecipe(req, res, next);

    expect(mockUpdateRecipe).toHaveBeenCalledWith("recipe-1", { title: "Updated Title" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("FINDING (HIGH): updates a recipe belonging to a DIFFERENT seller with no ownership check", async () => {
    // recipe-1 actually belongs to seller-1 (per recipeService/model), but the controller
    // never reads recipe.chef_id or compares it to req.user before calling the service —
    // it only uses req.params.id and req.body. This test proves the update goes through.
    mockUpdateRecipe.mockResolvedValue({
      recipe_id: "recipe-1",
      title: "Hijacked Title",
      chef_id: "seller-1", // original owner, untouched by the attacker's identity
    });

    const req = {
      params: { id: "recipe-1" }, // owned by seller-1
      body: { title: "Hijacked Title", price: 0.01 },
      user: { id: "seller-ATTACKER", user_id: "seller-ATTACKER" }, // different seller
    };
    const res = createMockResponse();
    const next = vi.fn();

    await updateRecipe(req, res, next);

    // ACTUAL behavior: the mutation succeeds — no 403/401 is ever returned.
    expect(mockUpdateRecipe).toHaveBeenCalledWith("recipe-1", {
      title: "Hijacked Title",
      price: 0.01,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("FINDING (HIGH): updates a recipe with no authenticated user on the request at all", async () => {
    // req.user is entirely absent (no session/auth middleware is mounted on this route:
    // src/routes/recipeRoutes.js has `router.put('/:id', updateRecipe)` with no
    // requireSession/protect middleware). The controller still proceeds.
    mockUpdateRecipe.mockResolvedValue({ recipe_id: "recipe-1", title: "Anonymous Edit" });

    const req = {
      params: { id: "recipe-1" },
      body: { title: "Anonymous Edit" },
      user: undefined,
    };
    const res = createMockResponse();
    const next = vi.fn();

    await updateRecipe(req, res, next);

    expect(mockUpdateRecipe).toHaveBeenCalledWith("recipe-1", { title: "Anonymous Edit" });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("recipeController.deleteRecipe — ownership check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a recipe owned by the requesting seller", async () => {
    mockDeleteRecipe.mockResolvedValue(true);

    const req = { params: { id: "recipe-1" }, user: { id: "seller-1" } };
    const res = createMockResponse();
    const next = vi.fn();

    await deleteRecipe(req, res, next);

    expect(mockDeleteRecipe).toHaveBeenCalledWith("recipe-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("FINDING (HIGH): deletes a recipe belonging to a DIFFERENT seller with no ownership check", async () => {
    mockDeleteRecipe.mockResolvedValue(true);

    const req = {
      params: { id: "recipe-1" }, // owned by seller-1
      user: { id: "seller-ATTACKER" }, // different seller, never verified against recipe.chef_id
    };
    const res = createMockResponse();
    const next = vi.fn();

    await deleteRecipe(req, res, next);

    // ACTUAL behavior: the delete proceeds unconditionally.
    expect(mockDeleteRecipe).toHaveBeenCalledWith("recipe-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("recipeController.verifyRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions a recipe to 'published' and logs a publication activity", async () => {
    mockVerifyRecipe.mockResolvedValue({
      recipe_id: "recipe-1",
      approval_status: "published",
    });

    const req = {
      params: { id: "recipe-1" },
      body: { approval_status: "published" },
    };
    const res = createMockResponse();
    const next = vi.fn();

    await verifyRecipe(req, res, next);

    expect(mockVerifyRecipe).toHaveBeenCalledWith("recipe-1", {
      approval_status: "published",
      rejection_reason: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("transitions a recipe to 'rejected' with a rejection reason", async () => {
    mockVerifyRecipe.mockResolvedValue({
      recipe_id: "recipe-1",
      approval_status: "rejected",
      rejection_reason: "Instructions incomplete",
    });

    const req = {
      params: { id: "recipe-1" },
      body: { approval_status: "rejected", rejection_reason: "Instructions incomplete" },
    };
    const res = createMockResponse();
    const next = vi.fn();

    await verifyRecipe(req, res, next);

    expect(mockVerifyRecipe).toHaveBeenCalledWith("recipe-1", {
      approval_status: "rejected",
      rejection_reason: "Instructions incomplete",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("passes service errors to next()", async () => {
    mockVerifyRecipe.mockRejectedValue(new Error("recipe not found"));

    const req = { params: { id: "missing" }, body: { approval_status: "published" } };
    const res = createMockResponse();
    const next = vi.fn();

    await verifyRecipe(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("recipeController.getRecipesByChef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns recipes for the given chef id", async () => {
    mockGetRecipesByChef.mockResolvedValue([
      { recipe_id: "recipe-1", chef_id: "seller-1", title: "Chicken Curry" },
    ]);

    const req = { params: { id: "seller-1" } };
    const res = createMockResponse();
    const next = vi.fn();

    await getRecipesByChef(req, res, next);

    expect(mockGetRecipesByChef).toHaveBeenCalledWith("seller-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
