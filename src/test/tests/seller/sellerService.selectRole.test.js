import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../models/sellerModel.js", () => ({
  default: {
    findSellerByUserId: vi.fn(),
    createSeller: vi.fn(),
    findSellerByNicNormalized: vi.fn(),
    findSellerByPhoneNormalized: vi.fn(),
    updateSellerByUserId: vi.fn(),
    getKycStatusByUserId: vi.fn(),
    markKycApprovalPageSeenByUserId: vi.fn()
  }
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn()
}));

import sellerService from "../../../services/sellerService.js";
import sellerModel from "../../../models/sellerModel.js";

describe("sellerService.selectSellerRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing seller row when one already exists", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });

    const result = await sellerService.selectSellerRole({ userId: "seller-1" });

    expect(result.verification_status).toBe("approved");
    expect(sellerModel.createSeller).not.toHaveBeenCalled();
  });

  it("creates a new seller row when none exists yet", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);
    sellerModel.createSeller.mockResolvedValue({
      user_id: "seller-1",
      verification_status: null
    });

    const result = await sellerService.selectSellerRole({ userId: "seller-1" });

    expect(sellerModel.createSeller).toHaveBeenCalledWith({ user_id: "seller-1" });
    expect(result.verification_status).toBeNull();
  });
});

describe("sellerService.getKycStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns KYC status for a pending seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "pending"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("pending");
  });

  it("returns KYC status for an approved seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "approved"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("approved");
  });

  it("returns KYC status with rejection reason for a rejected seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "rejected",
      rejection_reason: "Blurry photo"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.rejection_reason).toBe("Blurry photo");
  });

  it("throws when no seller record exists for the given user", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(sellerService.getKycStatus("missing-seller")).rejects.toThrow(
      "Seller record not found"
    );

    expect(sellerModel.getKycStatusByUserId).not.toHaveBeenCalled();
  });
});

describe("sellerService.markKycApprovalPageSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the approval page as seen for an approved seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });
    sellerModel.markKycApprovalPageSeenByUserId.mockResolvedValue({
      kyc_approval_page_seen: true
    });

    const result = await sellerService.markKycApprovalPageSeen("seller-1");

    expect(result.kyc_approval_page_seen).toBe(true);
  });

  it("rejects for a pending seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });

    await expect(
      sellerService.markKycApprovalPageSeen("seller-1")
    ).rejects.toThrow(
      "KYC approval page can only be marked as seen for approved sellers"
    );

    expect(sellerModel.markKycApprovalPageSeenByUserId).not.toHaveBeenCalled();
  });

  it("rejects for a rejected seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });

    await expect(
      sellerService.markKycApprovalPageSeen("seller-1")
    ).rejects.toThrow(
      "KYC approval page can only be marked as seen for approved sellers"
    );
  });

  it("throws when no seller record exists", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(
      sellerService.markKycApprovalPageSeen("missing-seller")
    ).rejects.toThrow("Seller record not found");
  });
});
