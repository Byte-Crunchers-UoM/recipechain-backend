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
    // Total reported reviews
const { count: totalReported, error: err1 } = await supabase
  .from("feedbacks")
  .select("*", { count: "exact", head: true })
  .eq("status", "reported");

if (err1) console.error(err1);

// Removed reviews
const { count: removedReviews, error: err2 } = await supabase
  .from("feedbacks")
  .select("*", { count: "exact", head: true })
  .eq("status", "removed");

if (err2) console.error(err2);

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
      removedReviews: removedReviews || 0,
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
      .delete()
      .eq("feedback_id", id)
      .select();

    if (error) throw error;

    await logActivity(
      "Review Approved",
      `Review ${id} was approved and deleted by admin.`,
      "REVIEW_MODERATION"
    );

    return res.status(200).json({
      success: true,
      message: "Review approved and deleted successfully",
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
      .update({ status: "not reported" })
      .eq("feedback_id", id)
      .select();

    if (error) throw error;

    await logActivity(
      "Review Removed",
      `Review ${id} report was dismissed by admin.`,
      "REVIEW_MODERATION"
    );

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

