import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined)
}));

import { supabase } from "../../../config/supabase.js";
import { logActivity } from "../../../utils/activityLogger.js";
import {
  getReportedReviews,
  approveReview,
  removeReview
} from "../../../controllers/adminReviewController.js";

function makeChain(result) {
  const chain = {};
  ["select", "update", "eq", "order"].forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

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

  it("returns reported reviews with stats on success", async () => {
    const reviewsChain = makeChain({
      data: [{ feedback_id: 1, status: "reported" }],
      error: null
    });
    const totalReportedChain = makeChain({ count: 3, error: null });
    const removedChain = makeChain({ count: 2, error: null });
    const resolvedChain = makeChain({ count: 1, error: null });

    supabase.from
      .mockImplementationOnce(() => reviewsChain)
      .mockImplementationOnce(() => totalReportedChain)
      .mockImplementationOnce(() => removedChain)
      .mockImplementationOnce(() => resolvedChain);

    const req = {};
    const res = createMockResponse();

    await getReportedReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        reviews: [{ feedback_id: 1, status: "reported" }],
        stats: { totalReported: 3, removedReviews: 2 }
      }
    });
  });

  it("returns 500 when the reviews query fails", async () => {
    const failingChain = makeChain({
      data: null,
      error: new Error("query failed")
    });
    supabase.from.mockImplementationOnce(() => failingChain);

    const req = {};
    const res = createMockResponse();

    await getReportedReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("adminReviewController.approveReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to 'not reported' and logs activity", async () => {
    const chain = makeChain({
      data: [{ feedback_id: "5", status: "not reported" }],
      error: null
    });
    supabase.from.mockImplementation(() => chain);

    const req = { params: { id: "5" } };
    const res = createMockResponse();

    await approveReview(req, res);

    expect(chain.update).toHaveBeenCalledWith({ status: "not reported" });
    expect(chain.eq).toHaveBeenCalledWith("feedback_id", "5");
    expect(logActivity).toHaveBeenCalledWith(
      "Review Approved",
      expect.stringContaining("5"),
      "REVIEW_MODERATION"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Review approved successfully",
      data: { feedback_id: "5", status: "not reported" }
    });
  });

  it("returns 500 on Supabase error and does not log activity", async () => {
    const chain = makeChain({ data: null, error: new Error("db error") });
    supabase.from.mockImplementation(() => chain);

    const req = { params: { id: "5" } };
    const res = createMockResponse();

    await approveReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe("adminReviewController.removeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to 'removed' and logs activity", async () => {
    const chain = makeChain({
      data: [{ feedback_id: "9", status: "removed" }],
      error: null
    });
    supabase.from.mockImplementation(() => chain);

    const req = { params: { id: "9" } };
    const res = createMockResponse();

    await removeReview(req, res);

    expect(chain.update).toHaveBeenCalledWith({ status: "removed" });
    expect(chain.eq).toHaveBeenCalledWith("feedback_id", "9");
    expect(logActivity).toHaveBeenCalledWith(
      "Review Removed",
      expect.stringContaining("9"),
      "REVIEW_MODERATION"
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 on Supabase error", async () => {
    const chain = makeChain({ data: null, error: new Error("db error") });
    supabase.from.mockImplementation(() => chain);

    const req = { params: { id: "9" } };
    const res = createMockResponse();

    await removeReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Failed to remove review" })
    );
  });
});

/**
 * Route-level check against the REAL router (src/routes/adminReviewRoutes.js).
 *
 * FINDING (HIGH): none of GET /reported, PATCH /:id/approve, or
 * PATCH /:id/remove have any auth middleware attached at all - not
 * requireSession, not protect, not protectAdmin. Any anonymous caller can
 * list reported reviews (including buyer/recipe details joined in) and can
 * dismiss or permanently remove any review.
 */
describe("adminReviewRoutes authorization gap (route-level, real router)", () => {
  let express;
  let request;
  let adminReviewRoutes;

  beforeEach(async () => {
    vi.clearAllMocks();
    express = (await import("express")).default;
    request = (await import("supertest")).default;
    adminReviewRoutes = (await import("../../../routes/adminReviewRoutes.js"))
      .default;
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/admin/reviews", adminReviewRoutes);
    return app;
  }

  it("[FINDING][HIGH] GET /reported is reachable with NO auth header/cookie", async () => {
    const reviewsChain = makeChain({ data: [], error: null });
    const countChain = makeChain({ count: 0, error: null });
    supabase.from
      .mockImplementationOnce(() => reviewsChain)
      .mockImplementationOnce(() => countChain)
      .mockImplementationOnce(() => countChain)
      .mockImplementationOnce(() => countChain);

    const app = buildApp();
    const res = await request(app).get("/api/admin/reviews/reported");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("[FINDING][HIGH] PATCH /:id/approve is reachable with NO auth and performs the write", async () => {
    const chain = makeChain({ data: [{ feedback_id: "1" }], error: null });
    supabase.from.mockImplementation(() => chain);

    const app = buildApp();
    const res = await request(app).patch("/api/admin/reviews/1/approve");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ status: "not reported" });
  });

  it("[FINDING][HIGH] PATCH /:id/remove is reachable with NO auth and performs the write", async () => {
    const chain = makeChain({ data: [{ feedback_id: "1" }], error: null });
    supabase.from.mockImplementation(() => chain);

    const app = buildApp();
    const res = await request(app).patch("/api/admin/reviews/1/remove");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ status: "removed" });
  });
});
