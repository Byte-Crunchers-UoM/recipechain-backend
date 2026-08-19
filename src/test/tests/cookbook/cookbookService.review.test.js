import { describe, it, expect, vi, beforeEach } from "vitest";

// ARRANGE: minimal in-memory Supabase-like store, scoped so review
// create/update logic and its ownership checks can be exercised directly.
let recipePurchases = [];
let feedbacks = [];
let recipesTable = [];

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
    order: vi.fn(() => {
      query._orderCalls = (query._orderCalls || 0) + 1;
      return query;
    }),
    maybeSingle: vi.fn(() => resolveSingle(query)),
    single: vi.fn(() => resolveSingle(query)),
    then: (resolve, reject) => resolveList(query).then(resolve, reject),
    insert: vi.fn((row) => {
      const newRow = { ...row, feedback_id: `feedback-${sourceRows(table).length + 1}`, created_at: "2026-01-05" };
      sourceRows(table).push(newRow);
      query._resultRow = newRow;
      return query;
    }),
    update: vi.fn((patch) => {
      query._patch = patch;
      return query;
    }),
  };
  return query;
}

function sourceRows(table) {
  if (table === "recipe_purchases") return recipePurchases;
  if (table === "feedbacks") return feedbacks;
  if (table === "recipes") return recipesTable;
  if (table === "feedback_images") return [];
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
  if (query._patch) {
    // update() path: apply patch onto the matched row.
    const rows = applyFilters(sourceRows(query._table), query._filters);
    Object.assign(rows[0] || {}, query._patch);
    return Promise.resolve({ data: rows[0] || null, error: null });
  }
  if (query._resultRow) {
    return Promise.resolve({ data: query._resultRow, error: null });
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
import activityService from "../../../services/activityService.js";

describe("cookbookService.upsertRecipeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    recipePurchases = [
      { purchase_id: "purchase-A", buyer_id: "buyer-A", recipe_id: "recipe-1" },
    ];

    feedbacks = [];

    recipesTable = [{ recipe_id: "recipe-1", title: "Chicken Curry" }];
  });

  it("rejects a review from a buyer who never purchased the recipe (ownership enforced server-side)", async () => {
    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-B",
        recipeId: "recipe-1",
        rating: 5,
        comment: "Great!",
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a non-integer or out-of-range rating", async () => {
    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 6,
        comment: "Too high",
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 0,
        comment: "Too low",
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 3.5,
        comment: "Not integer",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a comment longer than 500 characters", async () => {
    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 4,
        comment: "x".repeat(501),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects more than 5 review images", async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      mimetype: "image/png",
      size: 1000,
      buffer: Buffer.from("x"),
      originalname: `img${i}.png`,
    }));

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 4,
        comment: "ok",
        files,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a disallowed image mimetype", async () => {
    const files = [{ mimetype: "application/pdf", size: 1000, buffer: Buffer.from("x") }];

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-A",
        recipeId: "recipe-1",
        rating: 4,
        comment: "ok",
        files,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("creates a new review for a first-time reviewer and logs activity", async () => {
    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-A",
      recipeId: "recipe-1",
      rating: 5,
      comment: "Delicious",
    });

    expect(result.feedback.rating).toBe(5);
    expect(result.feedback.comment).toBe("Delicious");
    expect(result.rating_avg).toBe(5);
    expect(activityService.logActivity).toHaveBeenCalledTimes(1);
    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "buyer-A", type: "review" })
    );
  });

  it("updates the existing review (upsert) instead of creating a duplicate row", async () => {
    feedbacks = [
      {
        feedback_id: "feedback-existing",
        buyer_id: "buyer-A",
        recipe_id: "recipe-1",
        rating: 2,
        comment: "meh",
        created_at: "2026-01-01",
      },
    ];

    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-A",
      recipeId: "recipe-1",
      rating: 4,
      comment: "Actually pretty good",
    });

    expect(result.feedback.feedback_id).toBe("feedback-existing");
    expect(result.feedback.rating).toBe(4);
    expect(feedbacks).toHaveLength(1);
  });

  it("empty comment is stored as null, not an empty string", async () => {
    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-A",
      recipeId: "recipe-1",
      rating: 3,
      comment: "   ",
    });

    expect(result.feedback.comment).toBeNull();
  });
});
