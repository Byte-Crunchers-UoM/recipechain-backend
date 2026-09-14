import { describe, it, expect, vi, beforeEach } from "vitest";

let tableData = {};

function createQuery(table) {
  return {
    select: vi.fn(() => createQuery(table)),
    eq: vi.fn(() => createQuery(table)),
    in: vi.fn(() => Promise.resolve(tableData[table])),
    order: vi.fn(() => Promise.resolve(tableData[table])),
    maybeSingle: vi.fn(() => Promise.resolve(tableData[table]))
  };
}

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => createQuery(table))
  }
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn()
}));

import cookbookService from "../../../services/cookbookService.js";

describe("cookbookService.getMyCookbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    tableData = {
      recipe_purchases: {
        data: [
          {
            purchase_id: "purchase-1",
            recipe_id: "recipe-1",
            unlocked_at: "2026-01-01"
          },
          {
            purchase_id: "purchase-2",
            recipe_id: "recipe-2",
            unlocked_at: "2026-01-02"
          }
        ],
        error: null
      },
      recipes: {
        data: [
          {
            recipe_id: "recipe-1",
            title: "Chicken Curry",
            description: "Sri Lankan spicy curry",
            difficulty_level: "Medium",
            image_url: "",
            prep_time: 10,
            cook_time: 30,
            servings: 4,
            price: 20,
            rating_avg: 4.5,
            chef_id: "seller-1",
            created_at: "2026-01-01",
            status: "active"
          },
          {
            recipe_id: "recipe-2",
            title: "Milk Rice",
            description: "Traditional breakfast",
            difficulty_level: "Easy",
            image_url: "",
            prep_time: 5,
            cook_time: 20,
            servings: 3,
            price: 10,
            rating_avg: 5,
            chef_id: "seller-2",
            created_at: "2026-01-02",
            status: "active"
          }
        ],
        error: null
      },
      feedbacks: {
        data: [
          {
            feedback_id: "feedback-1",
            recipe_id: "recipe-1",
            buyer_id: "buyer-1",
            rating: 5,
            comment: "Great",
            created_at: "2026-01-03"
          }
        ],
        error: null
      },
      saved_recipes: {
        data: [
          {
            saved_id: "saved-1",
            recipe_id: "recipe-2"
          }
        ],
        error: null
      }
    };
  });

  it("returns cookbook items with review and favorite flags", async () => {
    const items = await cookbookService.getMyCookbook({
      buyerId: "buyer-1"
    });

    expect(items).toHaveLength(2);

    expect(items.find((item) => item.recipe_id === "recipe-1")).toMatchObject({
      has_reviewed: true,
      is_favorite: false
    });

    expect(items.find((item) => item.recipe_id === "recipe-2")).toMatchObject({
      has_reviewed: false,
      is_favorite: true
    });
  });

  it("filters cookbook by search query", async () => {
    const items = await cookbookService.getMyCookbook({
      buyerId: "buyer-1",
      search: "milk"
    });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Milk Rice");
  });

  it("filters reviewed recipes", async () => {
    const items = await cookbookService.getMyCookbook({
      buyerId: "buyer-1",
      reviewStatus: "reviewed"
    });

    expect(items).toHaveLength(1);
    expect(items[0].recipe_id).toBe("recipe-1");
  });

  it("filters favorite recipes", async () => {
    const items = await cookbookService.getMyCookbook({
      buyerId: "buyer-1",
      favoritesOnly: true
    });

    expect(items).toHaveLength(1);
    expect(items[0].recipe_id).toBe("recipe-2");
  });
});