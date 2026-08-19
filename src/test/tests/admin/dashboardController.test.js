import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

vi.mock("../../../services/dashboardService.js", () => ({
  getDashboardStatsService: vi.fn()
}));

import { supabase } from "../../../config/supabase.js";
import { getDashboardStatsService } from "../../../services/dashboardService.js";
import { getDashboardStats } from "../../../controllers/dashboardController.js";

function makeChain(result) {
  const chain = {};
  ["select", "order", "limit", "eq"].forEach((method) => {
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

describe("dashboardController.getDashboardStats (unit, controller-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("combines service stats, recent activities, and monthly chart data", async () => {
    getDashboardStatsService.mockResolvedValue({
      totalUsers: 10,
      totalRecipes: 20,
      pendingApprovals: 2,
      Sellers: 5,
      totalTransactions: 8,
      platformRevenue: "100.00 XRP"
    });

    const activitiesChain = makeChain({
      data: [{ id: 1, title: "Seller Verified" }],
      error: null
    });
    const paymentsChain = makeChain({
      data: [
        { commission_amount: "5.00", time_stamp: "2026-01-15T00:00:00.000Z" },
        { commission_amount: "3.50", time_stamp: "2026-01-20T00:00:00.000Z" }
      ],
      error: null
    });

    supabase.from
      .mockImplementationOnce(() => activitiesChain)
      .mockImplementationOnce(() => paymentsChain);

    const req = {};
    const res = createMockResponse();

    await getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];

    expect(payload.data.totalUsers).toBe(10);
    expect(payload.data.activities).toEqual([
      { id: 1, title: "Seller Verified" }
    ]);
    expect(payload.data.chartData).toEqual([
      { month: expect.any(String), revenue: 8.5, transactions: 2 }
    ]);
  });

  it("still returns 200 with empty chart data when the payments query errors", async () => {
    getDashboardStatsService.mockResolvedValue({
      totalUsers: 1,
      totalRecipes: 1,
      pendingApprovals: 0,
      Sellers: 0,
      totalTransactions: 0,
      platformRevenue: "0.00 XRP"
    });

    const activitiesChain = makeChain({ data: [], error: null });
    const paymentsChain = makeChain({
      data: null,
      error: new Error("payments query failed")
    });

    supabase.from
      .mockImplementationOnce(() => activitiesChain)
      .mockImplementationOnce(() => paymentsChain);

    const req = {};
    const res = createMockResponse();

    await getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.chartData).toEqual([]);
  });

  it("returns 500 when the underlying stats service throws", async () => {
    getDashboardStatsService.mockRejectedValue(new Error("stats failed"));

    const req = {};
    const res = createMockResponse();

    await getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to load dashboard data"
    });
  });
});

/**
 * Route-level positive control against the REAL router
 * (src/routes/dashboardRoutes.js). Unlike sellerRoutes/adminReviewRoutes,
 * GET /stats IS wired up behind protectAdmin, so this confirms the
 * middleware actually blocks unauthenticated/non-admin requests as
 * expected - included for contrast with the HIGH severity findings in
 * sellerController.authorization.test.js and adminReviewController.test.js.
 */
describe("dashboardRoutes /stats (route-level, real router + real protectAdmin)", () => {
  let express;
  let request;
  let dashboardRoutes;

  beforeEach(async () => {
    vi.clearAllMocks();
    express = (await import("express")).default;
    request = (await import("supertest")).default;
    dashboardRoutes = (await import("../../../routes/dashboardRoutes.js"))
      .default;
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/dashboard", dashboardRoutes);
    return app;
  }

  it("returns 401 with no Authorization header at all", async () => {
    const app = buildApp();

    const res = await request(app).get("/api/dashboard/stats");

    expect(res.status).toBe(401);
    expect(getDashboardStatsService).not.toHaveBeenCalled();
  });

  it("returns 401 for a malformed/missing bearer token", async () => {
    const app = buildApp();

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", "NotBearer sometoken");

    expect(res.status).toBe(401);
  });

  it("returns 403 when the token is valid but the user's role is not admin", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null
    });

    const usersChain = makeChain({ data: { role: "buyer" }, error: null });
    usersChain.single = vi.fn(() => usersChain);
    supabase.from.mockImplementation(() => usersChain);

    const app = buildApp();

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(getDashboardStatsService).not.toHaveBeenCalled();
  });

  it("proceeds to the controller when the token is valid and the role is admin", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null
    });

    const usersChain = makeChain({ data: { role: "admin" }, error: null });
    usersChain.single = vi.fn(() => usersChain);

    const activitiesChain = makeChain({ data: [], error: null });
    const paymentsChain = makeChain({ data: [], error: null });

    supabase.from
      .mockImplementationOnce(() => usersChain)
      .mockImplementationOnce(() => activitiesChain)
      .mockImplementationOnce(() => paymentsChain);

    getDashboardStatsService.mockResolvedValue({
      totalUsers: 1,
      totalRecipes: 1,
      pendingApprovals: 0,
      Sellers: 0,
      totalTransactions: 0,
      platformRevenue: "0.00 XRP"
    });

    const app = buildApp();

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", "Bearer valid-admin-token");

    expect(res.status).toBe(200);
    expect(getDashboardStatsService).toHaveBeenCalled();
  });
});
