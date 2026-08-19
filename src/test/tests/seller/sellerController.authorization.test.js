/**
 * These tests hit the REAL Express router (src/routes/sellerRoutes.js) via
 * supertest, with only the external boundaries (Supabase, activity logging,
 * cookie/session verification) mocked out. The goal is to prove - against
 * the actual route wiring, not an assumption - which seller endpoints are
 * reachable WITHOUT any authentication at all.
 *
 * FINDING (HIGH): createSeller, getAllSellers, getSellerById, updateSeller,
 * deleteSeller and verifySeller are mounted in src/routes/sellerRoutes.js
 * with no auth middleware whatsoever (no requireSession, no protect, no
 * protectAdmin). verifySeller in particular is the seller KYC
 * approve/reject action and should be admin-only - as wired today, any
 * anonymous caller can approve/reject any seller, or delete any seller
 * account, by hitting the route directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../../services/sellerService.js", () => ({
  default: {
    selectSellerRole: vi.fn(),
    submitKyc: vi.fn(),
    getKycStatus: vi.fn(),
    markKycApprovalPageSeen: vi.fn()
  }
}));

import { supabase } from "../../../config/supabase.js";
import sellerRoutes from "../../../routes/sellerRoutes.js";

function makeChain(result) {
  const chain = {};
  [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "order",
    "limit",
    "in",
    "single",
    "maybeSingle"
  ].forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/sellers", sellerRoutes);
  return app;
}

describe("sellerRoutes authorization gaps (route-level, real router)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[FINDING][HIGH] PATCH /:id/verify (approve/reject KYC) is reachable with NO auth header/cookie at all", async () => {
    const tables = {
      sellers: makeChain({
        data: [{ user_id: "seller-1", verification_status: "approved" }],
        error: null
      })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app)
      .patch("/api/sellers/seller-1/verify")
      .send({ status: "approved" });

    // No Authorization header, no rc_session cookie was sent at all, yet the
    // request was NOT rejected as unauthenticated/unauthorized.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The underlying mutation actually ran - this is a real write, not a
    // request that merely reached the handler and then no-op'd.
    expect(tables.sellers.update).toHaveBeenCalledWith(
      expect.objectContaining({ verification_status: "approved" })
    );
  });

  it("[FINDING][HIGH] DELETE /:id (permanently delete a seller + user) is reachable with NO auth", async () => {
    const tables = {
      sellers: makeChain({ error: null }),
      users: makeChain({ error: null })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app).delete("/api/sellers/seller-1");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(tables.sellers.delete).toHaveBeenCalled();
    expect(tables.users.delete).toHaveBeenCalled();
  });

  it("[FINDING][HIGH] PUT /:id (update any seller's profile) is reachable with NO auth", async () => {
    const tables = {
      sellers: makeChain({ error: null })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app)
      .put("/api/sellers/seller-1")
      .send({ display_name: "Attacker Controlled Name" });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(tables.sellers.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Attacker Controlled Name" })
    );
  });

  it("[FINDING] GET / (list all sellers) is reachable with NO auth", async () => {
    const tables = {
      sellers: makeChain({ data: [{ user_id: "seller-1" }], error: null }),
      users: makeChain({ data: [{ user_id: "seller-1", email: "s@test.com" }], error: null })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app).get("/api/sellers");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("[FINDING] GET /:id (any seller's private profile fields) is reachable with NO auth", async () => {
    const tables = {
      sellers: makeChain({ data: { user_id: "seller-1", nic_no: "200012345678" }, error: null }),
      users: makeChain({ data: { email: "s@test.com" }, error: null })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app).get("/api/sellers/seller-1");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    // Confirms the response leaks fields like nic_no with no auth at all.
    expect(res.body.data.nic_no).toBe("200012345678");
  });

  /**
   * FINDING (separate bug, not an authorization gap): POST / (createSeller)
   * references variables that were never destructured from req.body
   * (`nic_no`, `id_document_front_url`, `id_document_back_url`,
   * `experience`) instead of the ones that actually exist (`Nic_no`,
   * `Id_photo_path`, `experince`). This throws a ReferenceError on every
   * call, so the endpoint is completely broken in addition to being
   * unauthenticated. Captured here as ACTUAL behavior, not fixed.
   */
  it("[FINDING][BUG] POST / (createSeller) is unauthenticated AND crashes with a ReferenceError on every call", async () => {
    const tables = {
      users: makeChain({ error: null }),
      sellers: makeChain({ error: null })
    };
    supabase.from.mockImplementation((table) => tables[table]);

    const app = buildApp();

    const res = await request(app)
      .post("/api/sellers")
      .send({ email: "new-seller@test.com", full_name: "New Seller" });

    // Still not blocked by auth...
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    // ...but the handler itself throws before the sellers row is created.
    expect(res.status).toBe(500);
    expect(res.body.errorDetails).toMatch(/is not defined/);
  });
});

describe("sellerRoutes KYC endpoints (positive control - these DO enforce requireSession)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /kyc/status returns 401 with no rc_session cookie and no Authorization header", async () => {
    const app = buildApp();

    const res = await request(app).get("/api/sellers/kyc/status");

    expect(res.status).toBe(401);
  });

  it("POST /kyc/submit returns 401 with no rc_session cookie", async () => {
    const app = buildApp();

    const res = await request(app).post("/api/sellers/kyc/submit").send({});

    expect(res.status).toBe(401);
  });

  it("PATCH /kyc/approval-page-seen returns 401 with no rc_session cookie", async () => {
    const app = buildApp();

    const res = await request(app).patch(
      "/api/sellers/kyc/approval-page-seen"
    );

    expect(res.status).toBe(401);
  });
});
