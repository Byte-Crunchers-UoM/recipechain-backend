import aiService from "../services/aiService.js";

function getSessionUserId(req) {
  return req.user?.user_id || req.user?.id || req.session?.user_id || null;
}

function getSessionRole(req) {
  return req.user?.role || req.session?.role || null;
}

/**
 * Your AI Shopping Assistant
 * Route: POST /api/ai/shopping-assistant
 * Used by buyers with session authentication.
 */
export const askAIShoppingAssistant = async (req, res) => {
  try {
    const buyerId = getSessionUserId(req);
    const role = getSessionRole(req);

    if (!buyerId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated buyer not found",
      });
    }

    if (role && role !== "buyer") {
      return res.status(403).json({
        success: false,
        message: "Only buyers can use the AI Shopping Assistant",
      });
    }

    const { prompt, messages } = req.body || {};

    const result = await aiService.generateShoppingAssistantReply({
      buyerId,
      prompt,
      messages,
    });

    return res.status(200).json({
      success: true,
      message: "AI response generated successfully",
      reply: result.reply,
      usage: result.usage,
    });
  } catch (error) {
    console.error("askAIShoppingAssistant error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "AI Shopping Assistant failed. Please try again later.",
    });
  }
};

/**
 * Friend's general AI Chatbot
 * Route: POST /api/ai/chat
 * Used for general recipe recommendation chatbot.
 */
export const handleChat = async (req, res) => {
  try {
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const response = await aiService.processChatMessage(message);

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("AI Chat Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "AI process failed.",
    });
  }
};

export default {
  askAIShoppingAssistant,
  handleChat,
};