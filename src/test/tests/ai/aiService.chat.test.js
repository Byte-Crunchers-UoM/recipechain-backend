import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFeatureExtraction, mockPineconeQuery, mockChatCompletionsCreate } = vi.hoisted(() => ({
  mockFeatureExtraction: vi.fn(),
  mockPineconeQuery: vi.fn(),
  mockChatCompletionsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor() {
      this.chat = { completions: { create: mockChatCompletionsCreate } };
    }
  },
}));

vi.mock("@huggingface/inference", () => ({
  HfInference: class MockHfInference {
    constructor() {
      this.featureExtraction = mockFeatureExtraction;
    }
  },
}));

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: class MockPinecone {
    index() {
      return { query: mockPineconeQuery };
    }
  },
}));

/**
 * aiService caches its chat-client bootstrap in a module-level promise
 * (chatClientsPromise) that is never cleared on failure. Each test gets a
 * fresh module instance via resetModules so env-var/failure scenarios don't
 * leak into later tests (and so we can also document the caching behavior).
 */
async function freshAiService() {
  vi.resetModules();
  const mod = await import("../../../services/aiService.js");
  return mod.default;
}

describe("aiService.processChatMessage (public AI discovery / general chatbot)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.HUGGINGFACE_API_KEY = "test-hf-key";
    process.env.PINECONE_API_KEY = "test-pinecone-key";
  });

  it("throws a 400 for an empty/whitespace message", async () => {
    const aiService = await freshAiService();

    await expect(aiService.processChatMessage("   ")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws a 500 when a required chatbot env var is missing", async () => {
    delete process.env.PINECONE_API_KEY;
    const aiService = await freshAiService();

    await expect(aiService.processChatMessage("suggest a curry")).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("surfaces a controlled error when embedding generation fails", async () => {
    mockFeatureExtraction.mockRejectedValue(new Error("HF inference down"));
    const aiService = await freshAiService();

    await expect(aiService.processChatMessage("suggest a curry")).rejects.toThrow(
      "HF inference down"
    );
  });

  it("throws a 502 when embeddings come back empty", async () => {
    mockFeatureExtraction.mockResolvedValue([]);
    const aiService = await freshAiService();

    await expect(aiService.processChatMessage("suggest a curry")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("handles a no-indexed-result Pinecone search gracefully and still returns a reply", async () => {
    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockResolvedValue({ matches: [] });
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "No matches, but try this generic tip." } }],
    });

    const aiService = await freshAiService();
    const result = await aiService.processChatMessage("suggest a curry");

    expect(result.recipes).toEqual([]);
    expect(result.reply).toBe("No matches, but try this generic tip.");
  });

  it("returns matched recipes and a reply when Pinecone finds matches", async () => {
    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockResolvedValue({
      matches: [{ id: "recipe-1", metadata: { recipe_id: "recipe-1", title: "Milk Rice", price: 5 } }],
    });
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "Try Milk Rice!" } }],
    });

    const aiService = await freshAiService();
    const result = await aiService.processChatMessage("something sweet");

    expect(result.recipes).toEqual([
      { recipe_id: "recipe-1", title: "Milk Rice", price: 5, prep_time: null, image_url: null },
    ]);
    expect(result.reply).toBe("Try Milk Rice!");
  });

  it("returns a fallback reply string when the model returns no completion content", async () => {
    mockFeatureExtraction.mockResolvedValue([0.1]);
    mockPineconeQuery.mockResolvedValue({ matches: [] });
    mockChatCompletionsCreate.mockResolvedValue({ choices: [] });

    const aiService = await freshAiService();
    const result = await aiService.processChatMessage("hello");

    expect(result.reply).toBe("I found some recipes, but I could not generate a full reply.");
  });
});
