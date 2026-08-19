import { describe, it, expect, vi, beforeEach } from "vitest";

let recipePurchases = [];
let savedRecipes = [];
let nextSavedId = 1;

function createQuery(table) {
  const query = {
    _table: table,
    _filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => {
      query._filters[col] = val;
      return query;
    }),
    maybeSingle: vi.fn(() => resolveSingle(query)),
    single: vi.fn(() => resolveSingle(query)),
    insert: vi.fn((row) => {
      const newRow = { ...row, saved_id: `saved-${nextSavedId++}` };
      savedRecipes.push(newRow);
      query._resultRow = newRow;
      return query;
    }),
    delete: vi.fn(() => query),
    then: (resolve, reject) => resolveDelete(query).then(resolve, reject),
  };
  return query;
}

function sourceRows(table) {
  if (table === "recipe_purchases") return recipePurchases;
  if (table === "saved_recipes") return savedRecipes;
  return [];
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([col, val]) => row[col] === val)
  );
}

function resolveSingle(query) {
  if (query._resultRow) {
    return Promise.resolve({ data: query._resultRow, error: null });
  }
  const rows = applyFilters(sourceRows(query._table), query._filters);
  return Promise.resolve({ data: rows[0] || null, error: null });
}

function resolveDelete(query) {
  // Only used for the delete() chain: remove matching rows from the backing array.
  const table = sourceRows(query._table);
  const toDelete = applyFilters(table, query._filters);
  for (const row of toDelete) {
    const idx = table.indexOf(row);
    if (idx >= 0) table.splice(idx, 1);
  }
  return Promise.resolve({ data: null, error: null });
}

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => createQuery(table)),
  },
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn(),
}));

import cookbookService from "../../../services/cookbookService.js";

describe("cookbookService.toggleFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextSavedId = 1;

    recipePurchases = [
      { purchase_id: "purchase-A", buyer_id: "buyer-A", recipe_id: "recipe-1" },
      { purchase_id: "purchase-B", buyer_id: "buyer-B", recipe_id: "recipe-1" },
    ];

    savedRecipes = [];
  });

  it("rejects favoriting a recipe the buyer never purchased", async () => {
    await expect(
      cookbookService.toggleFavorite({ userId: "buyer-C", recipeId: "recipe-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("adds a favorite on first toggle", async () => {
    const result = await cookbookService.toggleFavorite({ userId: "buyer-A", recipeId: "recipe-1" });

    expect(result.is_favorite).toBe(true);
    expect(result.saved_id).toBeTruthy();
    expect(savedRecipes).toHaveLength(1);
    expect(savedRecipes[0].user_id).toBe("buyer-A");
  });

  it("removes the favorite on the second toggle (true dedup, not a duplicate insert)", async () => {
    const first = await cookbookService.toggleFavorite({ userId: "buyer-A", recipeId: "recipe-1" });
    expect(first.is_favorite).toBe(true);
    expect(savedRecipes).toHaveLength(1);

    const second = await cookbookService.toggleFavorite({ userId: "buyer-A", recipeId: "recipe-1" });
    expect(second.is_favorite).toBe(false);
    expect(second.saved_id).toBeNull();
    expect(savedRecipes).toHaveLength(0);
  });

  it("toggling favorite for buyer A does not create or remove buyer B's favorite on the same recipe", async () => {
    await cookbookService.toggleFavorite({ userId: "buyer-A", recipeId: "recipe-1" });
    await cookbookService.toggleFavorite({ userId: "buyer-B", recipeId: "recipe-1" });

    expect(savedRecipes).toHaveLength(2);
    expect(savedRecipes.some((r) => r.user_id === "buyer-A")).toBe(true);
    expect(savedRecipes.some((r) => r.user_id === "buyer-B")).toBe(true);

    // Now un-favorite only buyer A's; buyer B's row must remain.
    await cookbookService.toggleFavorite({ userId: "buyer-A", recipeId: "recipe-1" });

    expect(savedRecipes).toHaveLength(1);
    expect(savedRecipes[0].user_id).toBe("buyer-B");
  });
});
