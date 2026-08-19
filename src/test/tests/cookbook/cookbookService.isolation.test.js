import { describe, it, expect, vi, beforeEach } from "vitest";

// ARRANGE: in-memory fixtures representing two independent buyers who both
// purchased the same recipe. Buyer A left a review and favorited it; buyer B
// did neither. This is the shape most likely to leak data across buyers if
// any query in cookbookService forgets to filter by buyer_id.
let recipePurchases = [];
let recipes = [];
let feedbacks = [];
let savedRecipes = [];

function createQuery(table) {
  const query = {
    _table: table,
    _filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => {
      query._filters[col] = val;
      return query;
    }),
    in: vi.fn((col, vals) => {
      query._filters[col] = vals;
      return resolveList(query);
    }),
    order: vi.fn(() => resolveList(query)),
    maybeSingle: vi.fn(() => resolveSingle(query)),
    single: vi.fn(() => resolveSingle(query)),
    insert: vi.fn((row) => {
      const newRow = { ...row, saved_id: `saved-${sourceRows(table).length + 1}` };
      sourceRows(table).push(newRow);
      query._lastInserted = newRow;
      return query;
    }),
    delete: vi.fn(() => query),
  };
  return query;
}

function sourceRows(table) {
  if (table === "recipe_purchases") return recipePurchases;
  if (table === "recipes") return recipes;
  if (table === "feedbacks") return feedbacks;
  if (table === "saved_recipes") return savedRecipes;
  return [];
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([col, val]) => {
      if (Array.isArray(val)) return val.includes(row[col]);
      return row[col] === val;
    })
  );
}

function resolveList(query) {
  const rows = applyFilters(sourceRows(query._table), query._filters);
  return Promise.resolve({ data: rows, error: null });
}

function resolveSingle(query) {
  if (query._lastInserted) {
    return Promise.resolve({ data: query._lastInserted, error: null });
  }
  const rows = applyFilters(sourceRows(query._table), query._filters);
  return Promise.resolve({ data: rows[0] || null, error: null });
}

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => createQuery(table)),
  },
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn(),
}));

vi.mock("../../../services/activityService.js", () => ({
  default: {
    logActivity: vi.fn(() => Promise.resolve(null)),
  },
}));

import cookbookService from "../../../services/cookbookService.js";

describe("cookbookService cross-buyer isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    recipePurchases = [
      { purchase_id: "purchase-A", buyer_id: "buyer-A", recipe_id: "recipe-shared", unlocked_at: "2026-01-01" },
      { purchase_id: "purchase-B", buyer_id: "buyer-B", recipe_id: "recipe-shared", unlocked_at: "2026-01-02" },
      { purchase_id: "purchase-A2", buyer_id: "buyer-A", recipe_id: "recipe-A-only", unlocked_at: "2026-01-03" },
    ];

    recipes = [
      {
        recipe_id: "recipe-shared",
        title: "Shared Curry",
        description: "desc",
        image_url: "",
        difficulty_level: "Easy",
        prep_time: 5,
        cook_time: 10,
        servings: 2,
        price: 15,
        rating_avg: 4,
        chef_id: "seller-1",
        created_at: "2026-01-01",
        chef_note: "secret note",
        ingredients: ["a", "b"],
        instructions: ["step1"],
        status: "active",
      },
      {
        recipe_id: "recipe-A-only",
        title: "Buyer A Exclusive",
        description: "desc",
        image_url: "",
        difficulty_level: "Easy",
        prep_time: 5,
        cook_time: 10,
        servings: 2,
        price: 5,
        rating_avg: 4,
        chef_id: "seller-2",
        created_at: "2026-01-03",
        status: "active",
      },
    ];

    feedbacks = [
      {
        feedback_id: "feedback-A",
        recipe_id: "recipe-shared",
        buyer_id: "buyer-A",
        rating: 5,
        comment: "Buyer A's private review text",
        created_at: "2026-01-04",
      },
    ];

    savedRecipes = [{ saved_id: "saved-A", user_id: "buyer-A", recipe_id: "recipe-shared" }];
  });

  it("getMyCookbook: buyer B's cookbook list never includes buyer A's purchase-only recipe", async () => {
    const buyerBItems = await cookbookService.getMyCookbook({ buyerId: "buyer-B" });

    expect(buyerBItems).toHaveLength(1);
    expect(buyerBItems[0].recipe_id).toBe("recipe-shared");
    expect(buyerBItems.some((item) => item.recipe_id === "recipe-A-only")).toBe(false);
  });

  it("getMyCookbook: buyer B does not see buyer A's review/favorite flags on the shared recipe", async () => {
    const buyerBItems = await cookbookService.getMyCookbook({ buyerId: "buyer-B" });
    const sharedItem = buyerBItems.find((item) => item.recipe_id === "recipe-shared");

    // Buyer A reviewed and favorited this recipe; buyer B did neither.
    // If the feedback/saved_recipes queries were not scoped by buyer_id,
    // buyer A's flags (and review text) would leak into buyer B's view.
    expect(sharedItem.has_reviewed).toBe(false);
    expect(sharedItem.is_favorite).toBe(false);
    expect(sharedItem.my_feedback).toBeNull();
  });

  it("getMyCookbook: buyer A sees their own review/favorite flags on the same shared recipe", async () => {
    const buyerAItems = await cookbookService.getMyCookbook({ buyerId: "buyer-A" });
    const sharedItem = buyerAItems.find((item) => item.recipe_id === "recipe-shared");

    expect(sharedItem.has_reviewed).toBe(true);
    expect(sharedItem.is_favorite).toBe(true);
    expect(sharedItem.my_feedback.comment).toBe("Buyer A's private review text");
  });

  it("getCookbookRecipeDetails: buyer B viewing the shared recipe does not receive buyer A's feedback", async () => {
    const details = await cookbookService.getCookbookRecipeDetails({
      buyerId: "buyer-B",
      recipeId: "recipe-shared",
    });

    expect(details.my_feedback).toBeNull();
  });

  it("getCookbookRecipeDetails: buyer B cannot fetch details of a recipe only buyer A purchased (ownership enforced, not client-trusted)", async () => {
    await expect(
      cookbookService.getCookbookRecipeDetails({
        buyerId: "buyer-B",
        recipeId: "recipe-A-only",
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("toggleFavorite: buyer B favoriting the shared recipe does not affect buyer A's saved_recipes row", async () => {
    const result = await cookbookService.toggleFavorite({
      userId: "buyer-B",
      recipeId: "recipe-shared",
    });

    // Buyer B had no existing saved_recipes row for this recipe, so the
    // service should INSERT a new one scoped to buyer-B, not touch buyer-A's.
    expect(result.is_favorite).toBe(true);

    // Buyer A's original saved row must be untouched in our fixture store
    // (toggleFavorite only ever queried/deleted rows matching user_id: buyer-B).
    expect(savedRecipes.some((row) => row.user_id === "buyer-A" && row.recipe_id === "recipe-shared")).toBe(true);
  });

  it("toggleFavorite: buyer without a purchase cannot favorite another buyer's exclusive recipe", async () => {
    await expect(
      cookbookService.toggleFavorite({ userId: "buyer-B", recipeId: "recipe-A-only" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
