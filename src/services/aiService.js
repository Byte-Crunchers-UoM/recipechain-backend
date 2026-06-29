import { supabaseAdmin } from "../config/supabase.js";

const MAX_PROMPT_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 1000;
const MAX_UNLOCKED_RECIPES = 25;
const MAX_LOCKED_RECIPES = 35;
const GEMINI_TIMEOUT_MS = 30000;

function requireAdminClient() {
  if (!supabaseAdmin) {
    const error = new Error("Supabase admin client is not configured");
    error.statusCode = 500;
    throw error;
  }

  return supabaseAdmin;
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function truncateText(value, maxLength = 1200) {
  const text = cleanText(value);

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}...`;
}

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function compactJsonValue(value, maxLength = 1800) {
  if (value === null || value === undefined) return null;

  try {
    if (typeof value === "string") {
      return truncateText(value, maxLength);
    }

    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

function normalizeRecipeForAI(recipe, accessStatus) {
  return {
    recipe_id: recipe.recipe_id,
    title: cleanText(recipe.title, "Untitled Recipe"),
    description: truncateText(recipe.description, 500),
    access_status: accessStatus,
    servings: safeNumber(recipe.servings),
    prep_time_minutes: safeNumber(recipe.prep_time),
    cook_time_minutes: safeNumber(recipe.cook_time),
    difficulty_level: recipe.difficulty_level || null,
    price_xrp: safeNumber(recipe.price),
    rating_avg: safeNumber(recipe.rating_avg),
    ingredients:
      accessStatus === "unlocked"
        ? compactJsonValue(recipe.ingredients)
        : "LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL",
    instructions:
      accessStatus === "unlocked"
        ? compactJsonValue(recipe.instructions)
        : "LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL",
    chef_note:
      accessStatus === "unlocked"
        ? truncateText(recipe.chef_note, 500)
        : "LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL",
  };
}

function normalizeSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLockedRecipeMatches(prompt, lockedRecipes) {
  const normalizedPrompt = normalizeSearchText(prompt);

  if (!normalizedPrompt) return [];

  return lockedRecipes
    .filter((recipe) => {
      const title = normalizeSearchText(recipe.title);
      const titleWords = title.split(" ").filter((word) => word.length >= 4);

      if (title && normalizedPrompt.includes(title)) return true;

      return titleWords.some((word) => normalizedPrompt.includes(word));
    })
    .slice(0, 5)
    .map((recipe) => ({
      title: recipe.title,
      price_xrp: recipe.price_xrp,
      difficulty_level: recipe.difficulty_level,
      rating_avg: recipe.rating_avg,
    }));
}

function sanitizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        cleanText(message.content)
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: truncateText(message.content, MAX_HISTORY_MESSAGE_LENGTH),
    }));
}

async function getBuyerAIRecipeContext(buyerId) {
  const admin = requireAdminClient();

  const { data: purchases, error: purchaseError } = await admin
    .from("recipe_purchases")
    .select("purchase_id, recipe_id, unlocked_at")
    .eq("buyer_id", buyerId)
    .order("unlocked_at", { ascending: false });

  if (purchaseError) throw purchaseError;

  const unlockedRecipeIds = (purchases || [])
    .map((purchase) => purchase.recipe_id)
    .filter(Boolean);

  let unlockedRecipes = [];

  if (unlockedRecipeIds.length > 0) {
    const { data, error } = await admin
      .from("recipes")
      .select(
        `
        recipe_id,
        title,
        description,
        ingredients,
        instructions,
        servings,
        prep_time,
        cook_time,
        difficulty_level,
        price,
        rating_avg,
        chef_note,
        status,
        created_at
      `
      )
      .in("recipe_id", unlockedRecipeIds)
      .limit(MAX_UNLOCKED_RECIPES);

    if (error) throw error;

    unlockedRecipes = data || [];
  }

  const unlockedSet = new Set(unlockedRecipeIds);

  const { data: activeMarketplaceRecipes, error: marketplaceError } =
    await admin
      .from("recipes")
      .select(
        `
        recipe_id,
        title,
        description,
        servings,
        prep_time,
        cook_time,
        difficulty_level,
        price,
        rating_avg,
        status,
        created_at
      `
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);

  if (marketplaceError) throw marketplaceError;

  const lockedRecipes = (activeMarketplaceRecipes || [])
    .filter((recipe) => !unlockedSet.has(recipe.recipe_id))
    .slice(0, MAX_LOCKED_RECIPES);

  return {
    unlockedRecipes: unlockedRecipes.map((recipe) =>
      normalizeRecipeForAI(recipe, "unlocked")
    ),
    lockedMarketplaceRecipes: lockedRecipes.map((recipe) =>
      normalizeRecipeForAI(recipe, "locked")
    ),
  };
}

function buildSystemPrompt() {
  return `
You are RecipeChain's AI Shopping Assistant.

Your job:
1. Generate shopping lists from the buyer's unlocked cookbook recipes.
2. Scale ingredient quantities when serving sizes change.
3. Suggest practical ingredient substitutions.
4. Help the buyer discover marketplace recipes.

Critical monetization/access rules:
- You receive two recipe lists: unlockedRecipes and lockedMarketplaceRecipes.
- You may fully use ingredients, instructions, and chef notes ONLY from unlockedRecipes.
- Never reveal ingredients, instructions, cooking steps, chef notes, or hidden details from lockedMarketplaceRecipes.
- If the user asks for a locked premium recipe, a meal plan based on it, or details that require that locked recipe, tell them it is premium and suggest unlocking the exact recipe from the marketplace.
- When suggesting a locked recipe, include only the recipe name, price in XRP if available, difficulty, and rating if available.
- Do not include recipe IDs.
- Do not include internal URLs.
- Do not include paths like /recipes/recipe-id.
- Do not use markdown bold symbols such as **Recipe Name**.
- Write recipe names as normal plain text.
- Do not claim that a recipe is unlocked unless it appears in unlockedRecipes.
- If a user asks for a shopping list and they have no unlocked recipes, explain that they need to unlock recipes first.
- If the user asks for general substitutions not tied to a locked recipe, you may answer normally.

Response style:
- Be concise and helpful.
- Use plain text only.
- Do not use markdown formatting.
- Do not use ** symbols.
- Use simple bullet points with hyphens if needed.
- For scaled quantities, show the scaling ratio.
- If ingredient quantities are not structured enough to calculate exactly, make a best-effort estimate and say so.
`.trim();
}

function convertMessagesToGeminiContents(messages) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: String(message.content || ""),
        },
      ],
    }))
    .filter((item) => item.parts[0].text.trim().length > 0);
}

function extractGeminiReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

async function callGemini({ messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  if (!apiKey) {
    const error = new Error("Missing GEMINI_API_KEY in backend environment");
    error.statusCode = 500;
    throw error;
  }

  const systemMessage = messages.find((message) => message.role === "system");
  const contents = convertMessagesToGeminiContents(messages);

  if (contents.length === 0) {
    const error = new Error("Gemini request content is empty");
    error.statusCode = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: systemMessage
            ? {
                parts: [
                  {
                    text: systemMessage.content,
                  },
                ],
              }
            : undefined,
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        `Gemini request failed with status ${response.status}`;

      const error = new Error(errorMessage);
      error.statusCode = response.status >= 500 ? 502 : 500;
      throw error;
    }

    const reply = extractGeminiReply(data);

    if (!reply) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      const error = new Error(
        finishReason
          ? `Gemini did not return text. Finish reason: ${finishReason}`
          : "Gemini did not return a valid response"
      );
      error.statusCode = 502;
      throw error;
    }

    return {
      reply,
      usage: data?.usageMetadata || null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Gemini assistant request timed out");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateShoppingAssistantReply({ buyerId, prompt, messages }) {
  const cleanPrompt = truncateText(prompt, MAX_PROMPT_LENGTH);

  if (!buyerId) {
    const error = new Error("Authenticated buyer not found");
    error.statusCode = 401;
    throw error;
  }

  if (!cleanPrompt) {
    const error = new Error("Prompt is required");
    error.statusCode = 400;
    throw error;
  }

  const context = await getBuyerAIRecipeContext(buyerId);
  const lockedMatches = findLockedRecipeMatches(
    cleanPrompt,
    context.lockedMarketplaceRecipes
  );

  const safeHistory = sanitizeMessages(messages);

  const contextPayload = {
    buyer_id: buyerId,
    unlocked_recipe_count: context.unlockedRecipes.length,
    locked_marketplace_recipe_count: context.lockedMarketplaceRecipes.length,
    locked_recipe_matches_from_user_prompt: lockedMatches,
    unlockedRecipes: context.unlockedRecipes,
    lockedMarketplaceRecipes: context.lockedMarketplaceRecipes,
  };

  const geminiMessages = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    ...safeHistory,
    {
      role: "user",
      content: `
User prompt:
${cleanPrompt}

RecipeChain context:
${JSON.stringify(contextPayload, null, 2)}
`.trim(),
    },
  ];

  const result = await callGemini({ messages: geminiMessages });

  return {
    reply: result.reply,
    usage: result.usage,
  };
}

export default {
  generateShoppingAssistantReply,
};