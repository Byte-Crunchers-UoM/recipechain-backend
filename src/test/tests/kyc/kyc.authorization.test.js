import { describe, it, expect, vi, beforeEach } from "vitest";

// sellerController.js imports `supabase` (used by createSeller/getAllSellers/etc.)
// and `logActivity` (used by verifySeller). Neither is exercised by the KYC
// controller functions under test here, but both must be mocked so importing
// the controller module doesn't try to build a real Supabase client.
vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn()
}));

vi.mock("../../../services/sellerService.js", () => ({
  default: {
    selectSellerRole: vi.fn(),
    submitKyc: vi.fn(),
    getKycStatus: vi.fn(),
    markKycApprovalPageSeen: vi.fn()
  }
}));

import sellerController from "../../../controllers/sellerController.js";
import sellerService from "../../../services/sellerService.js";

const makeRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe("sellerController KYC endpoints - user scoping (never trust client-supplied id)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitKyc: scopes the submission to req.session.user_id, ignoring any userId supplied in the body", async () => {
    sellerService.submitKyc.mockResolvedValue({ verification_status: "pending" });

    const req = {
      session: { user_id: "seller-1" },
      // an attacker-controlled body trying to write another seller's KYC record
      body: { userId: "attacker-target-seller", fullName: "Someone Else" },
      files: {}
    };
    const res = makeRes();

    await sellerController.submitKyc(req, res, undefined);

    expect(sellerService.submitKyc).toHaveBeenCalledTimes(1);
    expect(sellerService.submitKyc).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "seller-1" })
    );
    // Explicitly confirm the attacker-supplied id from the body never reaches the service call.
    expect(sellerService.submitKyc.mock.calls[0][0].userId).not.toBe(
      "attacker-target-seller"
    );
  });

  it("submitKyc: falls back to req.user.user_id (protect middleware) when no session cookie is present", async () => {
    sellerService.submitKyc.mockResolvedValue({ verification_status: "pending" });

    const req = {
      user: { user_id: "seller-2" },
      body: { userId: "attacker-target-seller" },
      files: {}
    };
    const res = makeRes();

    await sellerController.submitKyc(req, res, undefined);

    expect(sellerService.submitKyc).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "seller-2" })
    );
  });

  it("submitKyc: session user_id takes priority over req.user.user_id when both are present", async () => {
    sellerService.submitKyc.mockResolvedValue({ verification_status: "pending" });

    const req = {
      session: { user_id: "seller-from-session" },
      user: { user_id: "seller-from-user" },
      body: {},
      files: {}
    };
    const res = makeRes();

    await sellerController.submitKyc(req, res, undefined);

    expect(sellerService.submitKyc).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "seller-from-session" })
    );
  });

  it("submitKyc: returns 401 and never calls the service when there is no authenticated user at all", async () => {
    const req = { body: { userId: "attacker-target-seller" }, files: {} };
    const res = makeRes();

    await sellerController.submitKyc(req, res, undefined);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(sellerService.submitKyc).not.toHaveBeenCalled();
  });

  it("getKycStatus: scopes to req.session.user_id, ignoring any userId supplied via query string", async () => {
    sellerService.getKycStatus.mockResolvedValue({ verification_status: "approved" });

    const req = {
      session: { user_id: "seller-1" },
      query: { userId: "attacker-target-seller" }
    };
    const res = makeRes();

    await sellerController.getKycStatus(req, res, undefined);

    expect(sellerService.getKycStatus).toHaveBeenCalledWith("seller-1");
  });

  it("getKycStatus: returns 401 and never calls the service when unauthenticated", async () => {
    const req = { query: { userId: "attacker-target-seller" } };
    const res = makeRes();

    await sellerController.getKycStatus(req, res, undefined);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(sellerService.getKycStatus).not.toHaveBeenCalled();
  });

  it("markKycApprovalPageSeen: scopes to req.session.user_id, ignoring any userId/id supplied in the body", async () => {
    sellerService.markKycApprovalPageSeen.mockResolvedValue({
      kyc_approval_page_seen: true
    });

    const req = {
      session: { user_id: "seller-1" },
      body: { userId: "attacker-target-seller", id: "attacker-target-seller" }
    };
    const res = makeRes();

    await sellerController.markKycApprovalPageSeen(req, res, undefined);

    expect(sellerService.markKycApprovalPageSeen).toHaveBeenCalledWith(
      "seller-1"
    );
  });

  it("markKycApprovalPageSeen: returns 401 and never calls the service when unauthenticated", async () => {
    const req = { body: {} };
    const res = makeRes();

    await sellerController.markKycApprovalPageSeen(req, res, undefined);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(sellerService.markKycApprovalPageSeen).not.toHaveBeenCalled();
  });
});
