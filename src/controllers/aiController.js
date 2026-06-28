import aiService from "../services/aiService.js";

function getSessionUserId(req) {
  return req.user?.user_id || req.user?.id || req.session?.user_id || null;
}

function getSessionRole(req) {
  return req.user?.role || req.session?.role || null;
}

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