import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockProcessChatMessage } = vi.hoisted(() => ({
  mockProcessChatMessage: vi.fn(),
}));

vi.mock("../../../services/aiService.js", () => ({
  default: {
    generateShoppingAssistantReply: vi.fn(),
    processChatMessage: mockProcessChatMessage,
  },
}));

import { handleChat } from "../../../controllers/aiController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("aiController.handleChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is reachable without any authentication data on req (public route per aiRoutes.js)", async () => {
    mockProcessChatMessage.mockResolvedValue({ reply: "Try Milk Rice!", recipes: [] });

    const req = { body: { message: "suggest a breakfast recipe" } };
    const res = createMockResponse();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reply: "Try Milk Rice!", recipes: [] },
    });
  });

  it("returns 400 when the message is missing", async () => {
    const req = { body: {} };
    const res = createMockResponse();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Message is required" })
    );
    expect(mockProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when the message is a blank/whitespace string", async () => {
    const req = { body: { message: "   " } };
    const res = createMockResponse();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockProcessChatMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when body itself is missing (malformed request)", async () => {
    const req = {};
    const res = createMockResponse();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("forwards downstream provider failure with its statusCode", async () => {
    const error = new Error("Failed to generate chatbot embedding");
    error.statusCode = 502;
    mockProcessChatMessage.mockRejectedValue(error);

    const req = { body: { message: "hello" } };
    const res = createMockResponse();

    await handleChat(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Failed to generate chatbot embedding" })
    );
  });
});
