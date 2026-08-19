import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const mockFrom = vi.fn();

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: (...args) => mockFrom(...args),
  },
}));

const mockFeatureExtraction = vi.fn();
const mockPineconeQuery = vi.fn();
const mockPineconeIndex = vi.fn(() => ({ query: mockPineconeQuery }));
const mockChatCompletionsCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mockChatCompletionsCreate } } };
  }),
}));

vi.mock("@huggingface/inference", () => ({
  HfInference: vi.fn().mockImplementation(function () {
    return { featureExtraction: mockFeatureExtraction };
  }),
}));

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: vi.fn().mockImplementation(function () {
    return { index: mockPineconeIndex };
  }),
}));

function setupEmptySupabaseMocks() {
  mockFrom.mockImplementation((table) => {
    if (table === "recipe_purchases") {
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
    }

    if (table === "recipes") {
      return {
        select: () => ({
          in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

async function loadFreshAiService() {
  vi.resetModules();

  const module = await import("../../../services/aiService.js");

  return module.default;
}

describe("aiService.generateShoppingAssistantReply - error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptySupabaseMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("rejects with 401 when buyerId is missing", async () => {
    const aiService = await loadFreshAiService();

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: null, prompt: "hi" })
    ).rejects.toMatchObject({ statusCode: 401, message: "Authenticated buyer not found" });
  });

  it("rejects with 400 when prompt is empty/missing", async () => {
    const aiService = await loadFreshAiService();

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "   " })
    ).rejects.toMatchObject({ statusCode: 400, message: "Prompt is required" });
  });

  it("rejects with 500 and a clear message when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const aiService = await loadFreshAiService();

    global.fetch = vi.fn();

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi" })
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Missing GEMINI_API_KEY in backend environment",
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("surfaces a controlled 502 error when Gemini returns a 5xx failure, without leaking raw provider payload shape", async () => {
    const aiService = await loadFreshAiService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "model overloaded" } }),
    });

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi" })
    ).rejects.toMatchObject({ statusCode: 502, message: "model overloaded" });
  });

  it("surfaces a controlled error when Gemini returns no text content", async () => {
    const aiService = await loadFreshAiService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] }),
    });

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi" })
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("SAFETY"),
    });
  });

  it("times out with a 504 when Gemini never responds (AbortError)", async () => {
    const aiService = await loadFreshAiService();

    global.fetch = vi.fn().mockImplementation(() => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    });

    await expect(
      aiService.generateShoppingAssistantReply({ buyerId: "buyer-1", prompt: "hi" })
    ).rejects.toMatchObject({ statusCode: 504, message: "Gemini assistant request timed out" });
  });
});

describe("aiService.processChatMessage - error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.HUGGINGFACE_API_KEY = "test-hf-key";
    process.env.PINECONE_API_KEY = "test-pinecone-key";
  });

  it("rejects with 400 when the message is empty", async () => {
    const aiService = await loadFreshAiService();

    await expect(aiService.processChatMessage("   ")).rejects.toMatchObject({
      statusCode: 400,
      message: "Message is required",
    });
  });

  it("rejects with a clear 500 message listing missing env vars when chatbot keys are not configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.PINECONE_API_KEY;

    const aiService = await loadFreshAiService();

    await expect(aiService.processChatMessage("hello")).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("GROQ_API_KEY"),
    });
  });

  it("returns a graceful 'no matches' context instead of erroring when Pinecone has no indexed result", async () => {
    const aiService = await loadFreshAiService();

    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockResolvedValue({ matches: [] });
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "No matches, but here's a tip." } }],
    });

    const result = await aiService.processChatMessage("find me a recipe");

    expect(result.recipes).toEqual([]);
    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("No close recipe matches found in Pinecone."),
          }),
        ]),
      })
    );
  });

  it("propagates a controlled error when the embedding provider fails", async () => {
    const aiService = await loadFreshAiService();

    mockFeatureExtraction.mockRejectedValue(new Error("HuggingFace is down"));

    await expect(aiService.processChatMessage("find me a recipe")).rejects.toThrow(
      "HuggingFace is down"
    );
  });

  it("rejects with a 502 when the embedding provider returns an empty vector", async () => {
    const aiService = await loadFreshAiService();

    mockFeatureExtraction.mockResolvedValue([]);

    await expect(aiService.processChatMessage("find me a recipe")).rejects.toMatchObject({
      statusCode: 502,
      message: "Failed to generate chatbot embedding",
    });
  });

  it("propagates a controlled error when Pinecone query fails", async () => {
    const aiService = await loadFreshAiService();

    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockRejectedValue(new Error("Pinecone unavailable"));

    await expect(aiService.processChatMessage("find me a recipe")).rejects.toThrow(
      "Pinecone unavailable"
    );
  });
});
