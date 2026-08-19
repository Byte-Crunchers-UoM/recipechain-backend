import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: { from: (...args) => mockFrom(...args) },
}));

import aiService from "../../../services/aiService.js";

/**
 * Builds a fake supabaseAdmin.from() implementation for the buyer AI recipe
 * context lookup used by generateShoppingAssistantReply: one query for the
 * buyer's unlocked purchases, one for the unlocked recipe rows, and one for
 * the active marketplace listing (used to compute locked recipes).
 */
function setupSupabase({ purchases = [], unlockedRecipes = [], marketplaceRecipes = [] }) {
  mockFrom.mockImplementation((table) => {
    if (table === "recipe_purchases") {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: purchases, error: null }),
          }),
        }),
      };
    }

    if (table === "recipes") {
      return {
        select: () => ({
          in: () => ({
            limit: () => Promise.resolve({ data: unlockedRecipes, error: null }),
          }),
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: marketplaceRecipes, error: null }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("aiService.generateShoppingAssistantReply - premium content redaction (paywall enforcement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends full ingredients/instructions/chef_note ONLY for purchased recipes and redacts them for unpurchased/locked recipes", async () => {
    setupSupabase({
      purchases: [{ purchase_id: "p1", recipe_id: "recipe-unlocked", unlocked_at: "2026-01-01" }],
      unlockedRecipes: [
        {
          recipe_id: "recipe-unlocked",
          title: "Milk Rice",
          description: "Traditional breakfast",
          ingredients: [{ name: "rice" }],
          instructions: ["boil", "simmer"],
          chef_note: "Use coconut milk",
          servings: 4,
          prep_time: 10,
          cook_time: 30,
          difficulty_level: "Easy",
          price: 0,
          rating_avg: 4.5,
        },
      ],
      marketplaceRecipes: [
        {
          recipe_id: "recipe-unlocked",
          title: "Milk Rice",
          price: 0,
          difficulty_level: "Easy",
          rating_avg: 4.5,
          status: "active",
          created_at: "2026-01-01",
        },
        {
          recipe_id: "recipe-locked",
          title: "Secret Curry",
          price: 25,
          difficulty_level: "Hard",
          rating_avg: 4.9,
          status: "active",
          created_at: "2026-01-02",
        },
      ],
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Here is your shopping list." }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-1",
      prompt: "Give me a shopping list",
      messages: [],
    });

    expect(result.reply).toBe("Here is your shopping list.");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMessage = requestBody.contents[requestBody.contents.length - 1].parts[0].text;
    const contextJson = JSON.parse(userMessage.split("RecipeChain context:\n")[1]);

    const unlockedEntry = contextJson.unlockedRecipes.find(
      (r) => r.recipe_id === "recipe-unlocked"
    );
    expect(unlockedEntry.ingredients).not.toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(unlockedEntry.instructions).not.toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(unlockedEntry.chef_note).toBe("Use coconut milk");

    const lockedEntry = contextJson.lockedMarketplaceRecipes.find(
      (r) => r.recipe_id === "recipe-locked"
    );
    expect(lockedEntry).toBeDefined();
    expect(lockedEntry.ingredients).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(lockedEntry.instructions).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");
    expect(lockedEntry.chef_note).toBe("LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL");

    // The already-unlocked recipe must never also appear in the locked list.
    expect(
      contextJson.lockedMarketplaceRecipes.find((r) => r.recipe_id === "recipe-unlocked")
    ).toBeUndefined();
  });

  it("throws a 401 when buyerId is missing", async () => {
    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: null, prompt: "hi", messages: [] })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws a 400 when the prompt is empty/whitespace", async () => {
    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "   ", messages: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws a 500 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    setupSupabase({ purchases: [], unlockedRecipes: [], marketplaceRecipes: [] });

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi", messages: [] })
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("surfaces a controlled error (not a crash) when the Gemini API call fails", async () => {
    setupSupabase({ purchases: [], unlockedRecipes: [], marketplaceRecipes: [] });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "model overloaded" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi", messages: [] })
    ).rejects.toThrow("model overloaded");
  });

  it("treats a buyer with no unlocked recipes and no locked matches as an empty-cookbook case without crashing", async () => {
    setupSupabase({ purchases: [], unlockedRecipes: [], marketplaceRecipes: [] });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "You have no unlocked recipes yet." }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await aiService.generateShoppingAssistantReply({
      buyerId: "buyer-empty",
      prompt: "shopping list",
      messages: [],
    });

    expect(result.reply).toBe("You have no unlocked recipes yet.");
  });
});
