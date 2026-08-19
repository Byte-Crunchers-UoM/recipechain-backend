import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock("../../../services/sellerService.js", () => ({
  default: {
    selectSellerRole: vi.fn(),
    submitKyc: vi.fn(),
    getKycStatus: vi.fn(),
    markKycApprovalPageSeen: vi.fn()
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn()
}));

import {
  submitKyc,
  getKycStatus,
  markKycApprovalPageSeen
} from "../../../controllers/sellerController.js";
import sellerService from "../../../services/sellerService.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("sellerController.submitKyc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 and never calls the service when there is no session user_id", async () => {
    const req = { session: undefined, user: undefined, body: {}, files: {} };
    const res = createMockResponse();

    await submitKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "No session user_id found"
    });
    expect(sellerService.submitKyc).not.toHaveBeenCalled();
  });

  it("reads the user id from req.session.user_id (requireSession) and forwards it to the service", async () => {
    sellerService.submitKyc.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });

    const req = {
      session: { user_id: "seller-1" },
      body: { fullName: "Amal" },
      files: { idDocumentFront: [{}], idDocumentBack: [{}] }
    };
    const res = createMockResponse();

    await submitKyc(req, res);

    expect(sellerService.submitKyc).toHaveBeenCalledWith({
      userId: "seller-1",
      body: req.body,
      files: req.files
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "KYC submitted successfully",
      data: { user_id: "seller-1", verification_status: "pending" }
    });
  });

  it("falls back to req.user.user_id when req.session is not present", async () => {
    sellerService.submitKyc.mockResolvedValue({ verification_status: "pending" });

    const req = {
      user: { user_id: "seller-2" },
      body: {},
      files: {}
    };
    const res = createMockResponse();

    await submitKyc(req, res);

    expect(sellerService.submitKyc).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "seller-2" })
    );
  });

  it("maps a DuplicateSellerIdentityError to a 409 response with friendly fields", async () => {
    const duplicateError = new Error("duplicate_seller_identity");
    duplicateError.name = "DuplicateSellerIdentityError";
    duplicateError.statusCode = 409;
    duplicateError.field = "nicNo";
    duplicateError.status = "pending";
    duplicateError.friendlyMessage = "Already under review.";

    sellerService.submitKyc.mockRejectedValue(duplicateError);

    const req = {
      session: { user_id: "seller-1" },
      body: {},
      files: {}
    };
    const res = createMockResponse();

    await submitKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "duplicate_seller_identity",
      field: "nicNo",
      status: "pending",
      friendlyMessage: "Already under review."
    });
  });

  it("returns 500 with the error message for a generic service failure when no next() is provided", async () => {
    sellerService.submitKyc.mockRejectedValue(
      new Error("Seller record not found. Please select seller role first.")
    );

    const req = {
      session: { user_id: "seller-1" },
      body: {},
      files: {}
    };
    const res = createMockResponse();

    await submitKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Seller record not found. Please select seller role first."
    });
  });

  it("delegates to next() when provided, instead of sending a response directly", async () => {
    const serviceError = new Error("boom");
    sellerService.submitKyc.mockRejectedValue(serviceError);

    const req = {
      session: { user_id: "seller-1" },
      body: {},
      files: {}
    };
    const res = createMockResponse();
    const next = vi.fn();

    await submitKyc(req, res, next);

    expect(next).toHaveBeenCalledWith(serviceError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("sellerController.getKycStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated session", async () => {
    const req = { session: undefined, user: undefined };
    const res = createMockResponse();

    await getKycStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(sellerService.getKycStatus).not.toHaveBeenCalled();
  });

  it("returns only the calling user's own KYC status (scoped by session user_id)", async () => {
    sellerService.getKycStatus.mockResolvedValue({
      verification_status: "approved",
      full_name: "Amal Viduranga"
    });

    const req = {
      session: { user_id: "seller-1" },
      // Even if a caller-controlled field tried to name another user, the
      // controller must not read identity from query/body - only from session.
      query: { userId: "someone-elses-id" },
      body: { userId: "someone-elses-id" }
    };
    const res = createMockResponse();

    await getKycStatus(req, res);

    expect(sellerService.getKycStatus).toHaveBeenCalledWith("seller-1");
    expect(sellerService.getKycStatus).not.toHaveBeenCalledWith(
      "someone-elses-id"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: { verification_status: "approved", full_name: "Amal Viduranga" }
    });
  });

  it("returns 500 for an unexpected service error with no next()", async () => {
    sellerService.getKycStatus.mockRejectedValue(new Error("db down"));

    const req = { session: { user_id: "seller-1" } };
    const res = createMockResponse();

    await getKycStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "db down" });
  });
});

describe("sellerController.markKycApprovalPageSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated session", async () => {
    const req = { session: undefined, user: undefined };
    const res = createMockResponse();

    await markKycApprovalPageSeen(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(sellerService.markKycApprovalPageSeen).not.toHaveBeenCalled();
  });

  it("marks the page seen for the session user and returns 200", async () => {
    sellerService.markKycApprovalPageSeen.mockResolvedValue({
      kyc_approval_page_seen: true
    });

    const req = { session: { user_id: "seller-1" } };
    const res = createMockResponse();

    await markKycApprovalPageSeen(req, res);

    expect(sellerService.markKycApprovalPageSeen).toHaveBeenCalledWith(
      "seller-1"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "KYC approval page marked as seen",
      data: { kyc_approval_page_seen: true }
    });
  });

  it("returns 500 when the seller is not approved yet and no next() is provided", async () => {
    sellerService.markKycApprovalPageSeen.mockRejectedValue(
      new Error(
        "KYC approval page can only be marked as seen for approved sellers"
      )
    );

    const req = { session: { user_id: "seller-1" } };
    const res = createMockResponse();

    await markKycApprovalPageSeen(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
