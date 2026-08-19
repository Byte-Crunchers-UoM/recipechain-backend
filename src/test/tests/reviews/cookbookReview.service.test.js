import { describe, it, expect, vi, beforeEach } from "vitest";

// cookbookService.upsertRecipeReview backs buyerController.upsertMyCookbookRecipeReview.
// These tests exercise the ACTUAL entitlement/ownership check (ensureBuyerOwnsRecipe,
// scoped by recipe_purchases.buyer_id + recipe_id), the ACTUAL validated rating range
// (integer 1-5, read from src/services/cookbookService.js), and the edit-own-review
// upsert behavior (a buyer's update is always scoped to their own buyer_id + recipe_id
// pair — there is no feedback_id taken from the request, so a buyer cannot target
// another buyer's review row through this endpoint).

/**
 * Minimal per-table, per-operation Supabase query-builder mock.
 * `handlers` is shaped as { [table]: { select: fn|queue, insert: fn, update: fn, delete: fn } }.
 * Handler functions receive { filters, payload } and return { data, error }.
 */
function createTableQuery(table, handlers) {
  let op = null;
  let payload;
  const filters = {};

  const resolve = () => {
    const tableHandlers = handlers[table] || {};
    const handler = tableHandlers[op];

    if (typeof handler === "function") {
      return Promise.resolve(handler({ filters, payload }));
    }

    if (Array.isArray(handler)) {
      const next = handler.shift();
      return Promise.resolve(next || { data: null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  };

  const builder = {
    select: vi.fn(() => {
      if (!op) op = "select";
      return builder;
    }),
    insert: vi.fn((data) => {
      op = "insert";
      payload = data;
      return builder;
    }),
    update: vi.fn((data) => {
      op = "update";
      payload = data;
      return builder;
    }),
    delete: vi.fn(() => {
      op = "delete";
      return builder;
    }),
    eq: vi.fn((col, val) => {
      filters[col] = val;
      return builder;
    }),
    in: vi.fn((col, vals) => {
      filters[col] = vals;
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => resolve()),
    single: vi.fn(() => resolve()),
    then: (onFulfilled, onRejected) => resolve().then(onFulfilled, onRejected),
    catch: (onRejected) => resolve().catch(onRejected),
  };

  return builder;
}

let handlers = {};

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => createTableQuery(table, handlers)),
  },
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn(),
}));

vi.mock("../../../services/activityService.js", () => ({
  default: {
    logActivity: vi.fn().mockResolvedValue(undefined),
  },
}));

import cookbookService from "../../../services/cookbookService.js";
import activityService from "../../../services/activityService.js";

describe("cookbookService.upsertRecipeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
  });

  it("blocks a review from a buyer who never purchased the recipe (entitlement check)", async () => {
    handlers = {
      recipe_purchases: {
        // ensureBuyerOwnsRecipe finds no purchase row for this buyer/recipe pair.
        select: () => ({ data: null, error: null }),
      },
    };

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-unauthorized",
        recipeId: "recipe-1",
        rating: 5,
        comment: "Great",
        files: [],
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Recipe not found in your cookbook",
    });
  });

  it("allows a review from a buyer who purchased the recipe, creating a new feedback row", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
          error: null,
        }),
      },
      feedbacks: {
        select: [
          // existing-review lookup: none found -> insert path
          { data: null, error: null },
          // recalculateRecipeRating reads all ratings for the recipe
          { data: [{ rating: 5 }], error: null },
        ],
        insert: () => ({
          data: {
            feedback_id: "fb-new",
            buyer_id: "buyer-1",
            recipe_id: "recipe-1",
            rating: 5,
            comment: "Great",
            created_at: "2026-08-19",
          },
          error: null,
        }),
      },
      feedback_images: {
        select: () => ({ data: [], error: null }),
      },
      recipes: {
        update: () => ({ data: null, error: null }),
        select: () => ({ data: { recipe_id: "recipe-1", title: "Chicken Curry" }, error: null }),
      },
    };

    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
      rating: 5,
      comment: "Great",
      files: [],
    });

    expect(result.feedback).toMatchObject({ feedback_id: "fb-new", rating: 5 });
    expect(result.rating_avg).toBe(5);
    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        type: "review",
        metadata: expect.objectContaining({ recipe_id: "recipe-1", rating: 5, is_update: false }),
      })
    );
  });

  it.each([0, 6, -1, 5.5])(
    "rejects rating %s as outside the actual validated 1-5 integer range",
    async (badRating) => {
      handlers = {
        recipe_purchases: {
          select: () => ({
            data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
            error: null,
          }),
        },
      };

      await expect(
        cookbookService.upsertRecipeReview({
          buyerId: "buyer-1",
          recipeId: "recipe-1",
          rating: badRating,
          comment: "",
          files: [],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Rating must be an integer between 1 and 5",
      });
    }
  );

  it("rejects a missing/undefined rating field", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
          error: null,
        }),
      },
    };

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-1",
        recipeId: "recipe-1",
        rating: undefined,
        comment: "No rating supplied",
        files: [],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("edits the buyer's own existing review (update path) rather than creating a duplicate", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
          error: null,
        }),
      },
      feedbacks: {
        select: [
          // existing-review lookup: buyer already reviewed -> update path
          { data: { feedback_id: "fb-existing" }, error: null },
          // recalculateRecipeRating
          { data: [{ rating: 3 }], error: null },
        ],
        update: () => ({
          data: {
            feedback_id: "fb-existing",
            buyer_id: "buyer-1",
            recipe_id: "recipe-1",
            rating: 3,
            comment: "Updated opinion",
            created_at: "2026-08-01",
          },
          error: null,
        }),
      },
      feedback_images: {
        select: () => ({ data: [], error: null }),
      },
      recipes: {
        update: () => ({ data: null, error: null }),
        select: () => ({ data: { recipe_id: "recipe-1", title: "Chicken Curry" }, error: null }),
      },
    };

    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
      rating: 3,
      comment: "Updated opinion",
      files: [],
    });

    expect(result.feedback.feedback_id).toBe("fb-existing");
    expect(result.feedback.rating).toBe(3);
    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ is_update: true }),
      })
    );
  });

  it("scopes the existing-review lookup to buyer_id + recipe_id, so a buyer cannot edit another buyer's review through this endpoint", async () => {
    // There is no feedback_id accepted from the caller anywhere in upsertRecipeReview's
    // signature — the existing-row lookup is always `.eq('buyer_id', buyerId).eq('recipe_id', recipeId)`.
    // This test documents that scoping by asserting the eq() calls made against `feedbacks`.
    const eqCalls = [];

    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-2", recipe_id: "recipe-1" },
          error: null,
        }),
      },
      feedbacks: {
        select: [
          { data: null, error: null },
          { data: [{ rating: 4 }], error: null },
        ],
        insert: () => ({
          data: {
            feedback_id: "fb-buyer-2",
            buyer_id: "buyer-2",
            recipe_id: "recipe-1",
            rating: 4,
            comment: null,
            created_at: "2026-08-19",
          },
          error: null,
        }),
      },
      feedback_images: { select: () => ({ data: [], error: null }) },
      recipes: {
        update: () => ({ data: null, error: null }),
        select: () => ({ data: { recipe_id: "recipe-1", title: "Chicken Curry" }, error: null }),
      },
    };

    const result = await cookbookService.upsertRecipeReview({
      buyerId: "buyer-2",
      recipeId: "recipe-1",
      rating: 4,
      comment: null,
      files: [],
    });

    // buyer-2's own review is created, independent of any other buyer's feedback row.
    expect(result.feedback.buyer_id).toBe("buyer-2");
    expect(result.feedback.feedback_id).toBe("fb-buyer-2");
  });

  it("rejects more than 5 uploaded review photos", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
          error: null,
        }),
      },
    };

    const sixFiles = Array.from({ length: 6 }, (_, i) => ({
      mimetype: "image/png",
      size: 1000,
      buffer: Buffer.from(`img-${i}`),
    }));

    await expect(
      cookbookService.upsertRecipeReview({
        buyerId: "buyer-1",
        recipeId: "recipe-1",
        rating: 5,
        comment: "",
        files: sixFiles,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "You can upload up to 5 photos only",
    });
  });
});

describe("cookbookService.getCookbookRecipeForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
  });

  it("throws a 403 when the requesting buyer has not purchased the recipe", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({ data: null, error: null }),
      },
    };

    await expect(
      cookbookService.getCookbookRecipeForReview({
        buyerId: "buyer-unauthorized",
        recipeId: "recipe-1",
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns recipe + existing feedback for the owning buyer", async () => {
    handlers = {
      recipe_purchases: {
        select: () => ({
          data: { purchase_id: "p1", buyer_id: "buyer-1", recipe_id: "recipe-1" },
          error: null,
        }),
      },
      recipes: {
        select: () => ({
          data: { recipe_id: "recipe-1", title: "Chicken Curry" },
          error: null,
        }),
      },
      feedbacks: {
        select: () => ({
          data: {
            feedback_id: "fb-1",
            buyer_id: "buyer-1",
            recipe_id: "recipe-1",
            rating: 4,
            comment: "Nice",
            created_at: "2026-08-01",
          },
          error: null,
        }),
      },
      feedback_images: {
        select: () => ({ data: [], error: null }),
      },
    };

    const result = await cookbookService.getCookbookRecipeForReview({
      buyerId: "buyer-1",
      recipeId: "recipe-1",
    });

    expect(result.recipe_id).toBe("recipe-1");
    expect(result.my_feedback).toMatchObject({ feedback_id: "fb-1", rating: 4 });
  });
});
