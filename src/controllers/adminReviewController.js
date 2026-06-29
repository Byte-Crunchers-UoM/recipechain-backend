import { supabase } from "../config/supabase.js";
import { logActivity } from "../utils/activityLogger.js";

/**
 * GET /api/admin/reviews/reported
 * Fetch only feedbacks where status = 'reported' ordered by created_at DESC
 */
export const getReportedReviews = async (req, res) => {
  try {
    const { data: reviews, error: reviewsError } = await supabase
      .from("feedbacks")
      .select("*, buyers(*), recipes(*)")
      .eq("status", "reported")
      .order("created_at", { ascending: false });

    if (reviewsError) throw reviewsError;

    // Fetch live statistics from the database
    // 1. Total Reported Reviews: reviews that are/were reported (status = 'reported', 'under review', or 'resolved')
    const { count: totalReported, error: err1 } = await supabase
      .from("feedbacks")
      .select("*", { count: "exact", head: true })
      .in("status", ["reported", "under review", "under_review", "resolved"]);

    if (err1) console.error("Error counting total reported reviews:", err1);

    // 2. Pending Review: reviews with status 'reported' or 'under review'
    const { count: pendingReview, error: err2 } = await supabase
      .from("feedbacks")
      .select("*", { count: "exact", head: true })
      .in("status", ["reported", "under review", "under_review"]);

    if (err2) console.error("Error counting pending reviews:", err2);

    // 3. Resolved Reviews: reviews with status 'resolved'
    const { count: resolvedReviews, error: err3 } = await supabase
      .from("feedbacks")
      .select("*", { count: "exact", head: true })
      .eq("status", "resolved");

    if (err3) console.error("Error counting resolved reviews:", err3);

    return res.status(200).json({
      success: true,
      data: {
        reviews: reviews || [],
        stats: {
          totalReported: totalReported || 0,
          pendingReview: pendingReview || 0,
          resolvedReviews: resolvedReviews || 0
        }
      }
    });
  } catch (error) {
    console.error("Failed to load reported reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load reported reviews",
      errorDetails: error.message
    });
  }
};

/**
 * PATCH /api/admin/reviews/:id/approve
 * Update status to 'approved' and log activity
 */
export const approveReview = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("feedbacks")
      .update({ status: "not reported" })
      .eq("feedback_id", id)
      .select();

    if (error) throw error;

    await logActivity(
      "Report Dismissed",
      `Review ${id} was approved and marked as not reported.`,
      "REVIEW_MODERATION"
    );

    return res.status(200).json({
      success: true,
      message: "Review approved successfully",
      data: data?.[0] || null
    });
  } catch (error) {
    console.error("Approve Review Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve review",
      errorDetails: error.message
    });
  }
};

/**
 * PATCH /api/admin/reviews/:id/remove
 * Update status to 'removed' and log activity
 */
export const removeReview = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("feedbacks")
      .update({ status: "removed" })
      .eq("feedback_id", id)
      .select();

    if (error) throw error;

    await logActivity("Review Removed", `Review ${id} was removed.`, "REVIEW_MODERATION");

    return res.status(200).json({
      success: true,
      message: "Review removed successfully",
      data: data?.[0] || null
    });
  } catch (error) {
    console.error("Remove Review Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove review",
      errorDetails: error.message
    });
  }
};

/**
 * PATCH /api/admin/reviews/:id/resolve
 * Update status to 'resolved' and log activity
 */
export const resolveReview = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("feedbacks")
      .update({ status: "resolved" })
      .eq("feedback_id", id)
      .select();

    if (error) throw error;

    await logActivity("Review Resolved", `Review ${id} was marked as resolved.`, "REVIEW_MODERATION");

    return res.status(200).json({
      success: true,
      message: "Review resolved successfully",
      data: data?.[0] || null
    });
  } catch (error) {
    console.error("Resolve Review Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resolve review",
      errorDetails: error.message
    });
  }
};
