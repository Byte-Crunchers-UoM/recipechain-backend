import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateShoppingAssistantReply, mockProcessChatMessage } = vi.hoisted(() => ({
  mockGenerateShoppingAssistantReply: vi.fn(),
  mockProcessChatMessage: vi.fn(),
}));

vi.mock("../../../services/aiService.js", () => ({
  default: {
    generateShoppingAssistantReply: mockGenerateShoppingAssistantReply,
    processChatMessage: mockProcessChatMessage,
  },
}));

import { askAIShoppingAssistant, handleChat } from "../../../controllers/aiController.js";

function createMockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("aiController.askAIShoppingAssistant (cookbook-aware shopping assistant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated buyer", async () => {
    const req = { user: null, session: null, body: { prompt: "hi" } };
    const res = createMockRes();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGenerateShoppingAssistantReply).not.toHaveBeenCalled();
  });

  it("returns 403 when the session role is not buyer", async () => {
    const req = { user: { user_id: "seller-1", role: "seller" }, body: { prompt: "hi" } };
    const res = createMockRes();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockGenerateShoppingAssistantReply).not.toHaveBeenCalled();
  });

  it("scopes the AI cookbook context request to the authenticated buyer's own id (buyer isolation)", async () => {
    mockGenerateShoppingAssistantReply.mockResolvedValueOnce({ reply: "ok for buyer A", usage: null });

    const reqA = { user: { user_id: "buyer-A", role: "buyer" }, body: { prompt: "shopping list" } };
    const resA = createMockRes();
    await askAIShoppingAssistant(reqA, resA);

    expect(mockGenerateShoppingAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: "buyer-A" })
    );

    mockGenerateShoppingAssistantReply.mockClear();
    mockGenerateShoppingAssistantReply.mockResolvedValueOnce({ reply: "ok for buyer B", usage: null });

    const reqB = { user: { user_id: "buyer-B", role: "buyer" }, body: { prompt: "shopping list" } };
    const resB = createMockRes();
    await askAIShoppingAssistant(reqB, resB);

    expect(mockGenerateShoppingAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: "buyer-B" })
    );
    expect(mockGenerateShoppingAssistantReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ buyerId: "buyer-A" })
    );
  });

  it("returns a controlled error response (not a crash) when the AI provider fails", async () => {
    const providerError = new Error("Gemini assistant request timed out");
    providerError.statusCode = 504;
    mockGenerateShoppingAssistantReply.mockRejectedValue(providerError);

    const req = { user: { user_id: "buyer-1", role: "buyer" }, body: { prompt: "hi" } };
    const res = createMockRes();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Gemini assistant request timed out",
    });
  });

  it("delegates malformed/empty-body prompt validation to the service layer without crashing", async () => {
    const promptError = new Error("Prompt is required");
    promptError.statusCode = 400;
    mockGenerateShoppingAssistantReply.mockRejectedValue(promptError);

    const req = { user: { user_id: "buyer-1", role: "buyer" }, body: {} };
    const res = createMockRes();

    await expect(askAIShoppingAssistant(req, res)).resolves.not.toThrow();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("aiController.handleChat (public AI discovery assistant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when message is missing", async () => {
    const req = { body: {} };
    const res = createMockRes();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when message is empty/whitespace", async () => {
    const req = { body: { message: "   " } };
    const res = createMockRes();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns the chatbot response on success", async () => {
    mockProcessChatMessage.mockResolvedValue({ reply: "Try Milk Rice!", recipes: [] });

    const req = { body: { message: "suggest something sweet" } };
    const res = createMockRes();

    await handleChat(req, res);

    expect(mockProcessChatMessage).toHaveBeenCalledWith("suggest something sweet");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reply: "Try Milk Rice!", recipes: [] },
    });
  });

  it("returns a controlled error response when the provider fails", async () => {
    const err = new Error("Missing AI chatbot environment variable(s): PINECONE_API_KEY");
    err.statusCode = 500;
    mockProcessChatMessage.mockRejectedValue(err);

    const req = { body: { message: "hi" } };
    const res = createMockRes();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: err.message,
    });
  });
});
