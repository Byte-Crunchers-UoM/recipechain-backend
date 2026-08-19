import { describe, it, expect, vi, beforeEach } from "vitest";

// adminReviewController business logic (per src/controllers/adminReviewController.js):
// - getReportedReviews: only feedbacks with status = 'reported' are listed, plus counts
//   for 'reported' and 'removed' statuses.
// - approveReview: sets status to 'not reported' (dismisses the report) and logs activity.
// - removeReview: sets status to 'removed' and logs activity.
// Route-level admin auth guard is intentionally out of scope here (covered separately).

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: mockLogActivity,
}));

let fromImpl;

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn((...args) => fromImpl(...args)),
  },
}));

import {
  getReportedReviews,
  approveReview,
  removeReview,
} from "../../../controllers/adminReviewController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("adminReviewController.getReportedReviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only reported reviews with reported/removed stats", async () => {
    fromImpl = (table) => {
      if (table === "feedbacks") {
        return {
          select: (columns, opts) => {
            if (opts?.count === "exact" && opts?.head) {
              // Two head-count calls happen: totalReported (status=reported),
              // removedReviews (status=removed), resolvedReviews (status=resolved).
              return {
                eq: (col, val) => {
                  if (val === "reported") return Promise.resolve({ count: 3, error: null });
                  if (val === "removed") return Promise.resolve({ count: 2, error: null });
                  if (val === "resolved") return Promise.resolve({ count: 0, error: null });
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            }

            // Main listing query: select("*, buyers(*), recipes(*)")
            return {
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        feedback_id: "fb-1",
                        status: "reported",
                        rating: 1,
                        comment: "Terrible, spam link included",
                        buyers: { display_name: "Buyer One" },
                        recipes: { title: "Fake Recipe" },
                      },
                    ],
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
    };

    const req = {};
    const res = createMockResponse();

    await getReportedReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.reviews).toHaveLength(1);
    expect(payload.data.reviews[0].status).toBe("reported");
    expect(payload.data.stats).toMatchObject({ totalReported: 3, removedReviews: 2 });
  });

  it("returns 500 when the reviews query fails", async () => {
    fromImpl = () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: new Error("DB down") }),
        }),
      }),
    });

    const req = {};
    const res = createMockResponse();

    await getReportedReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Failed to load reported reviews" })
    );
  });
});

describe("adminReviewController.approveReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses a report by setting status to 'not reported' and logs the moderation activity", async () => {
    fromImpl = (table) => {
      expect(table).toBe("feedbacks");
      return {
        update: (payload) => {
          expect(payload).toEqual({ status: "not reported" });
          return {
            eq: (col, val) => {
              expect(col).toBe("feedback_id");
              expect(val).toBe("fb-1");
              return {
                select: () =>
                  Promise.resolve({
                    data: [{ feedback_id: "fb-1", status: "not reported" }],
                    error: null,
                  }),
              };
            },
          };
        },
      };
    };

    const req = { params: { id: "fb-1" } };
    const res = createMockResponse();

    await approveReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Review approved successfully",
        data: { feedback_id: "fb-1", status: "not reported" },
      })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      "Review Approved",
      expect.stringContaining("fb-1"),
      "REVIEW_MODERATION"
    );
  });

  it("returns 500 when the update fails", async () => {
    fromImpl = () => ({
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: null, error: new Error("row not found") }),
        }),
      }),
    });

    const req = { params: { id: "missing-fb" } };
    const res = createMockResponse();

    await approveReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("adminReviewController.removeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets a reported review's status to 'removed' and logs the moderation activity", async () => {
    fromImpl = (table) => {
      expect(table).toBe("feedbacks");
      return {
        update: (payload) => {
          expect(payload).toEqual({ status: "removed" });
          return {
            eq: () => ({
              select: () =>
                Promise.resolve({
                  data: [{ feedback_id: "fb-2", status: "removed" }],
                  error: null,
                }),
            }),
          };
        },
      };
    };

    const req = { params: { id: "fb-2" } };
    const res = createMockResponse();

    await removeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Review removed successfully",
        data: { feedback_id: "fb-2", status: "removed" },
      })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      "Review Removed",
      expect.stringContaining("fb-2"),
      "REVIEW_MODERATION"
    );
  });

  it("returns 500 when the update fails", async () => {
    fromImpl = () => ({
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: null, error: new Error("row not found") }),
        }),
      }),
    });

    const req = { params: { id: "missing-fb" } };
    const res = createMockResponse();

    await removeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
