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
import { uploadBufferToCloudinary } from "../../../utils/uploadToCloudinary.js";

const validFile = (name = "id.png") => ({
  originalname: name,
  mimetype: "image/png",
  size: 1024,
  buffer: Buffer.from("fake-image")
});

const validBody = {
  fullName: "Amal Viduranga",
  dateOfBirth: "2000-01-01",
  nationality: "Sri Lankan",
  address: "No 10, Colombo, Sri Lanka",
  phoneNo: "+94753681070",
  nicNo: "200012345678",
  confirmAccuracy: "true",
  agreeTerms: "true"
};

describe("sellerService.getKycStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no seller record exists for the user", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(sellerService.getKycStatus("no-such-seller")).rejects.toThrow(
      "Seller record not found"
    );

    expect(sellerModel.getKycStatusByUserId).not.toHaveBeenCalled();
  });

  it("returns status for a seller with no KYC submitted yet (fresh record)", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: null
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: null,
      verification_submitted_at: null,
      verified_at: null,
      rejection_reason: null,
      full_name: null
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBeNull();
    expect(sellerModel.getKycStatusByUserId).toHaveBeenCalledWith("seller-1");
  });

  it("returns status for a pending seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "pending",
      verification_submitted_at: "2026-08-01T00:00:00.000Z",
      verified_at: null,
      rejection_reason: null
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("pending");
    expect(status.verified_at).toBeNull();
  });

  it("returns status for an approved seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "approved",
      verification_submitted_at: "2026-08-01T00:00:00.000Z",
      verified_at: "2026-08-05T00:00:00.000Z",
      rejection_reason: null
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("approved");
    expect(status.verified_at).toBe("2026-08-05T00:00:00.000Z");
  });

  it("returns status for a rejected seller including the rejection reason", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "rejected",
      verification_submitted_at: "2026-08-01T00:00:00.000Z",
      verified_at: null,
      rejection_reason: "Document image was blurry"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("rejected");
    expect(status.rejection_reason).toBe("Document image was blurry");
  });
});

describe("sellerService.markKycApprovalPageSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no seller record exists for the user", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(
      sellerService.markKycApprovalPageSeen("no-such-seller")
    ).rejects.toThrow("Seller record not found");

    expect(sellerModel.markKycApprovalPageSeenByUserId).not.toHaveBeenCalled();
  });

  it("throws when seller is still pending (not yet approved)", async () => {
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

  it("throws when seller was rejected", async () => {
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

  it("marks the approval page as seen for an approved seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });
    sellerModel.markKycApprovalPageSeenByUserId.mockResolvedValue({
      kyc_approval_page_seen: true
    });

    const result = await sellerService.markKycApprovalPageSeen("seller-1");

    expect(sellerModel.markKycApprovalPageSeenByUserId).toHaveBeenCalledWith(
      "seller-1"
    );
    expect(result.kyc_approval_page_seen).toBe(true);
  });
});

describe("sellerService.submitKyc - resubmission after rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sellerModel.findSellerByNicNormalized.mockResolvedValue(null);
    sellerModel.findSellerByPhoneNormalized.mockResolvedValue(null);

    uploadBufferToCloudinary.mockResolvedValue({
      secure_url: "https://cloudinary.test/id.png",
      public_id: "test-public-id"
    });
  });

  it("clears the previous rejection_reason/verified_at and resets kyc_approval_page_seen on resubmission", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected",
      rejection_reason: "Blurry ID photo",
      verified_at: null,
      kyc_approval_page_seen: false
    });

    sellerModel.updateSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });

    await sellerService.submitKyc({
      userId: "seller-1",
      body: validBody,
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({
        verification_status: "pending",
        rejection_reason: null,
        verified_at: null,
        kyc_approval_page_seen: false
      })
    );
  });

  it("rejects resubmission while a previous submission is still pending review", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow(
      "Your KYC verification is already under review. Please wait for the review to complete before resubmitting."
    );

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("rejects resubmission when the seller is already approved", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow(
      "Your KYC has already been approved. No further submissions are required."
    );

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("throws when there is no seller record at all (must select seller role first)", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow(
      "Seller record not found. Please select seller role first."
    );
  });
});
