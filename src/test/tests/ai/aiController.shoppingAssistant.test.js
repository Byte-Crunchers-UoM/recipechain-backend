import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateShoppingAssistantReply } = vi.hoisted(() => ({
  mockGenerateShoppingAssistantReply: vi.fn(),
}));

vi.mock("../../../services/aiService.js", () => ({
  default: {
    generateShoppingAssistantReply: mockGenerateShoppingAssistantReply,
    processChatMessage: vi.fn(),
  },
}));

import { askAIShoppingAssistant } from "../../../controllers/aiController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("aiController.askAIShoppingAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated buyer", async () => {
    const req = { user: null, session: null, body: { prompt: "hi" } };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGenerateShoppingAssistantReply).not.toHaveBeenCalled();
  });

  it("returns 403 when the session role is not 'buyer'", async () => {
    const req = {
      user: { user_id: "seller-1", role: "seller" },
      body: { prompt: "hi" },
    };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Only buyers can use the AI Shopping Assistant" })
    );
    expect(mockGenerateShoppingAssistantReply).not.toHaveBeenCalled();
  });

  it("only ever forwards the session's own buyerId to the AI service, never a client-supplied one", async () => {
    mockGenerateShoppingAssistantReply.mockResolvedValue({
      reply: "Here is your list",
      usage: null,
    });

    const req = {
      user: { user_id: "buyer-1", role: "buyer" },
      // A malicious/buggy client tries to impersonate another buyer via the body.
      body: { prompt: "hi", buyerId: "buyer-attacker-supplied", messages: [] },
    };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(mockGenerateShoppingAssistantReply).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      prompt: "hi",
      messages: [],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, reply: "Here is your list" })
    );
  });

  it("falls back to an empty cookbook context gracefully when the service returns an empty reply context", async () => {
    mockGenerateShoppingAssistantReply.mockResolvedValue({ reply: "You have no unlocked recipes yet.", usage: null });

    const req = { user: { user_id: "buyer-2", role: "buyer" }, body: {} };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(mockGenerateShoppingAssistantReply).toHaveBeenCalledWith({
      buyerId: "buyer-2",
      prompt: undefined,
      messages: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards the AI service's statusCode and message on failure", async () => {
    const error = new Error("Prompt is required");
    error.statusCode = 400;
    mockGenerateShoppingAssistantReply.mockRejectedValue(error);

    const req = { user: { user_id: "buyer-1", role: "buyer" }, body: { prompt: "" } };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Prompt is required" })
    );
  });

  it("defaults to 500 when a downstream error has no statusCode", async () => {
    mockGenerateShoppingAssistantReply.mockRejectedValue(new Error("boom"));

    const req = { user: { user_id: "buyer-1", role: "buyer" }, body: { prompt: "hi" } };
    const res = createMockResponse();

    await askAIShoppingAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
