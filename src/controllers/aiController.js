import aiService from "../services/aiService.js";

export const handleChat = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: "Message is required" });

        const response = await aiService.processChatMessage(message);
        res.status(200).json({ success: true, data: response });
    } catch (error) {
        console.error("AI Chat Error:", error);
        res.status(500).json({ success: false, message: "AI process failed." });
    }
};