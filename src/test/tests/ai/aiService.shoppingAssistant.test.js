import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ARRANGE: two buyers with disjoint unlocked recipe sets, plus a shared
// active marketplace. The critical property under test is that
// getBuyerAIRecipeContext / generateShoppingAssistantReply only ever
// includes ONE buyer's purchases as "unlocked" and never leaks another
// buyer's ingredients/instructions/chef_note into the prompt.
let recipePurchases = [];
let recipesTable = [];

function createQuery(table) {
  const query = {
    _table: table,
    _filters: {},
    _limit: null,
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => {
      query._filters[col] = val;
      return query;
    }),
    in: vi.fn((col, vals) => {
      query._filters[col] = vals;
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn((n) => {
      query._limit = n;
      return resolveList(query);
    }),
    then: (resolve, reject) => resolveList(query).then(resolve, reject),
  };
  return query;
}

function sourceRows(table) {
  if (table === "recipe_purchases") return recipePurchases;
  if (table === "recipes") return recipesTable;
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
  let rows = applyFilters(sourceRows(query._table), query._filters);
  if (query._limit) rows = rows.slice(0, query._limit);
  return Promise.resolve({ data: rows, error: null });
}

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => createQuery(table)),
  },
}));

import aiService from "../../../services/aiService.js";

const ORIGINAL_ENV = { ...process.env };

describe("aiService shopping assistant — buyer cookbook context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    process.env.GEMINI_API_KEY = "test-key";

    recipePurchases = [
      { purchase_id: "p-A1", buyer_id: "buyer-A", recipe_id: "recipe-A1", unlocked_at: "2026-01-01" },
      { purchase_id: "p-B1", buyer_id: "buyer-B", recipe_id: "recipe-B1", unlocked_at: "2026-01-02" },
    ];

    recipesTable = [
      {
        recipe_id: "recipe-A1",
        title: "Buyer A's Secret Curry",
        description: "desc",
        ingredients: ["secret ingredient A"],
        instructions: ["secret step A"],
        servings: 4,
        prep_time: 10,
        cook_time: 20,
        difficulty_level: "Easy",
        price: 10,
        rating_avg: 4.5,
        chef_note: "Buyer A's private chef note",
        status: "active",
        created_at: "2026-01-01",
      },
      {
        recipe_id: "recipe-B1",
        title: "Buyer B's Secret Cake",
        description: "desc",
        ingredients: ["secret ingredient B"],
        instructions: ["secret step B"],
        servings: 4,
        prep_time: 10,
        cook_time: 20,
        difficulty_level: "Easy",
        price: 12,
        rating_avg: 4.0,
        chef_note: "Buyer B's private chef note",
        status: "active",
        created_at: "2026-01-02",
      },
      {
        recipe_id: "recipe-market",
        title: "Untouched Marketplace Recipe",
        description: "desc",
        ingredients: ["market ingredient"],
        instructions: ["market step"],
        servings: 2,
        prep_time: 5,
        cook_time: 5,
        difficulty_level: "Medium",
        price: 8,
        rating_avg: 3.0,
        chef_note: "market chef note",
        status: "active",
        created_at: "2026-01-03",
      },
    ];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  function stubGeminiFetch(replyText = "Here is your shopping list.") {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: replyText }] } }],
          }),
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("buyer A's prompt context includes only buyer A's purchase as unlocked, never buyer B's", async () => {
    const fetchMock = stubGeminiFetch();

    await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-A",
      prompt: "Make me a shopping list",
      messages: [],
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = requestBody.contents.at(-1).parts[0].text;
    const contextJson = JSON.parse(userContent.split("RecipeChain context:\n")[1]);

    expect(contextJson.unlockedRecipes).toHaveLength(1);
    expect(contextJson.unlockedRecipes[0].recipe_id).toBe("recipe-A1");
    expect(contextJson.unlockedRecipes[0].ingredients).toContain("secret ingredient A");

    const lockedIds = contextJson.lockedMarketplaceRecipes.map((r) => r.recipe_id);
    expect(lockedIds).toContain("recipe-B1");
    expect(lockedIds).toContain("recipe-market");
  });

  it("buyer B's purchased recipe appears redacted (locked) in buyer A's context, not with real ingredients", async () => {
    const fetchMock = stubGeminiFetch();

    await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-A",
      prompt: "shopping list",
      messages: [],
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = requestBody.contents.at(-1).parts[0].text;
    const contextJson = JSON.parse(userContent.split("RecipeChain context:\n")[1]);

    const buyerBRecipeInContext = contextJson.lockedMarketplaceRecipes.find(
      (r) => r.recipe_id === "recipe-B1"
    );

    expect(buyerBRecipeInContext).toBeDefined();
    expect(buyerBRecipeInContext.ingredients).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(buyerBRecipeInContext.instructions).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(buyerBRecipeInContext.chef_note).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");

    // The raw secret text must not appear anywhere in the full prompt sent to Gemini.
    expect(userContent).not.toContain("secret ingredient B");
    expect(userContent).not.toContain("secret step B");
    expect(userContent).not.toContain("Buyer B's private chef note");
  });

  it("switching buyerId flips which recipe is unlocked vs locked (symmetry check)", async () => {
    const fetchMock = stubGeminiFetch();

    await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-B",
      prompt: "shopping list",
      messages: [],
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = requestBody.contents.at(-1).parts[0].text;
    const contextJson = JSON.parse(userContent.split("RecipeChain context:\n")[1]);

    expect(contextJson.unlockedRecipes).toHaveLength(1);
    expect(contextJson.unlockedRecipes[0].recipe_id).toBe("recipe-B1");
    expect(userContent).not.toContain("secret ingredient A");
  });

  it("throws a 401 when buyerId is missing (defensive check independent of route auth)", async () => {
    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: null, prompt: "hi", messages: [] })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws a 400 when the prompt is empty/whitespace-only", async () => {
    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-A", prompt: "   ", messages: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("handles an empty cookbook (buyer with zero purchases) without crashing", async () => {
    recipePurchases = [];
    const fetchMock = stubGeminiFetch();

    const result = await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-nobody",
      prompt: "Give me a shopping list",
      messages: [],
    });

    expect(result.reply).toBeTruthy();

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = requestBody.contents.at(-1).parts[0].text;
    const contextJson = JSON.parse(userContent.split("RecipeChain context:\n")[1]);

    expect(contextJson.unlockedRecipes).toHaveLength(0);
  });

  it("propagates a Gemini provider failure as a controlled error, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: "model overloaded" } }),
        })
      )
    );

    await expect(
      aiService.generateShoppingAssistantReply({
        buyerId: "buyer-A",
        prompt: "shopping list",
        messages: [],
      })
    ).rejects.toMatchObject({ statusCode: 502, message: "model overloaded" });
  });

  it("throws a 500 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    stubGeminiFetch();

    await expect(
      aiService.generateShoppingAssistantReply({
        buyerId: "buyer-A",
        prompt: "shopping list",
        messages: [],
      })
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
