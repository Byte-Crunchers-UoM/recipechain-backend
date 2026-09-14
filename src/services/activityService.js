import { supabase, supabaseAdmin } from "../config/supabase.js";

const db = supabaseAdmin || supabase;

const ALLOWED_ACTIVITY_TYPES = new Set([
  "purchase",
  "review",
  "profile_update",
]);

const toAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : 0;
};

const normalizeActivityType = (type) => {
  const normalized = String(type || "").trim().toLowerCase();

  if (ALLOWED_ACTIVITY_TYPES.has(normalized)) {
    return normalized;
  }

  return "profile_update";
};

const logActivity = async ({
  userId,
  type,
  title,
  description = "",
  amountXrp = 0,
  status = "completed",
  referenceTable = null,
  referenceId = null,
  metadata = {},
}) => {
  if (!userId) return null;

  try {
    const activity = {
      user_id: userId,
      type: normalizeActivityType(type),
      title: String(title || "Activity").trim(),
      description: String(description || "").trim(),
      amount_xrp: toAmount(amountXrp),
      status: String(status || "completed").trim().toLowerCase(),
      reference_table: referenceTable,
      reference_id: referenceId,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    };

    const { data, error } = await db
      .from("user_activities")
      .insert([activity])
      .select()
      .single();

    if (error) {
      console.error("logActivity failed:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("logActivity crashed:", error);
    return null;
  }
};

const getUserActivities = async ({ userId, limit = 50 }) => {
  if (!userId) return [];

  try {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const { data, error } = await db
      .from("user_activities")
      .select(
        "activity_id, user_id, type, title, description, amount_xrp, status, reference_table, reference_id, metadata, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.error("getUserActivities failed:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("getUserActivities crashed:", error);
    return [];
  }
};

export default {
  logActivity,
  getUserActivities,
};