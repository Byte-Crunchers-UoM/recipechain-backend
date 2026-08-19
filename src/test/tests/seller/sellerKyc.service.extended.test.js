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

const validFile = (name = "id.png", overrides = {}) => ({
  originalname: name,
  mimetype: "image/png",
  size: 1024,
  buffer: Buffer.from("fake-image"),
  ...overrides
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

describe("sellerService.submitKyc - extended coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });

    sellerModel.findSellerByNicNormalized.mockResolvedValue(null);
    sellerModel.findSellerByPhoneNormalized.mockResolvedValue(null);

    uploadBufferToCloudinary.mockResolvedValue({
      secure_url: "https://cloudinary.test/id.png",
      public_id: "test-public-id"
    });

    sellerModel.updateSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });
  });

  it("rejects when front ID document is missing", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow("Front side ID document is required");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("rejects when back ID document is missing", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")]
        }
      })
    ).rejects.toThrow("Back side ID document is required");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("rejects a file exceeding the 10MB size limit", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [
            validFile("front.png", { size: 11 * 1024 * 1024 })
          ],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow("file size must be 10MB or less");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("accepts application/pdf as a valid document type", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: validBody,
      files: {
        idDocumentFront: [
          validFile("front.pdf", { mimetype: "application/pdf" })
        ],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(uploadBufferToCloudinary).toHaveBeenCalledTimes(2);
    expect(result.verification_status).toBe("pending");
  });

  it("rejects unsupported file type on the back document even when front is valid", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [
            validFile("back.gif", { mimetype: "image/gif" })
          ]
        }
      })
    ).rejects.toThrow("only JPG, PNG and PDF files are allowed");
  });

  it("propagates a Cloudinary upload failure and does not update the seller row", async () => {
    uploadBufferToCloudinary.mockRejectedValueOnce(
      new Error("Cloudinary upload failed")
    );

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow("Cloudinary upload failed");

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("rejects duplicate phone number", async () => {
    sellerModel.findSellerByPhoneNormalized.mockResolvedValue({
      user_id: "other-seller",
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
    ).rejects.toMatchObject({
      name: "DuplicateSellerIdentityError",
      statusCode: 409,
      field: "phoneNo",
      status: "approved"
    });

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("blocks resubmission while a previous submission is still pending", async () => {
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
    ).rejects.toThrow("already under review");

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("blocks resubmission when the seller is already approved", async () => {
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
    ).rejects.toThrow("already been approved");

    expect(sellerModel.updateSellerByUserId).not.toHaveBeenCalled();
  });

  it("allows resubmission after rejection and clears the previous rejection reason", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected",
      rejection_reason: "Blurry ID photo"
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

  it("throws when no seller record exists for the user yet", async () => {
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
    ).rejects.toThrow("Please select seller role first");
  });

  /**
   * FINDING: sellerService has no format validation for NIC/phone numbers.
   * normalizeNic/normalizePhone only strip non-alphanumeric characters; they
   * do not enforce a minimum length or reject non-numeric junk. A NIC/phone
   * made entirely of symbols normalizes to an EMPTY string and is still
   * accepted and persisted, which also weakens the duplicate-identity check
   * (every "garbage" submission normalizes to the same empty key).
   */
  it("[FINDING] accepts a NIC value that normalizes to an empty string (no format validation)", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: { ...validBody, nicNo: "!!!---!!!" },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(sellerModel.findSellerByNicNormalized).toHaveBeenCalledWith(
      "",
      "seller-1"
    );
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({
        nic_no: "!!!---!!!",
        nic_no_normalized: ""
      })
    );
    expect(result.verification_status).toBe("pending");
  });

  it("[FINDING] accepts a phone value that normalizes to an empty string (no format validation)", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: { ...validBody, phoneNo: "call-me-maybe" },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(sellerModel.findSellerByPhoneNormalized).toHaveBeenCalledWith(
      "",
      "seller-1"
    );
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({
        phone_no: "call-me-maybe",
        phone_no_normalized: ""
      })
    );
    expect(result.verification_status).toBe("pending");
  });
});

describe("sellerService.getKycStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no seller record exists for the user", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(sellerService.getKycStatus("seller-404")).rejects.toThrow(
      "Seller record not found"
    );

    expect(sellerModel.getKycStatusByUserId).not.toHaveBeenCalled();
  });

  it("returns pending status details", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "pending",
      full_name: "Amal Viduranga"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("pending");
    expect(sellerModel.getKycStatusByUserId).toHaveBeenCalledWith("seller-1");
  });

  it("returns approved status details", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "approved"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "approved",
      verified_at: "2026-01-01T00:00:00.000Z"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("approved");
  });

  it("returns rejected status details with a rejection reason", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "rejected",
      rejection_reason: "Blurry ID photo"
    });

    const status = await sellerService.getKycStatus("seller-1");

    expect(status.verification_status).toBe("rejected");
    expect(status.rejection_reason).toBe("Blurry ID photo");
  });

  it("only ever queries the model using the exact userId it was given (no cross-user leakage at the service layer)", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-A",
      verification_status: "approved"
    });
    sellerModel.getKycStatusByUserId.mockResolvedValue({
      verification_status: "approved"
    });

    await sellerService.getKycStatus("seller-A");

    expect(sellerModel.findSellerByUserId).toHaveBeenCalledWith("seller-A");
    expect(sellerModel.findSellerByUserId).not.toHaveBeenCalledWith(
      "seller-B"
    );
    expect(sellerModel.getKycStatusByUserId).toHaveBeenCalledWith(
      "seller-A"
    );
  });
});

describe("sellerService.markKycApprovalPageSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no seller record exists", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(
      sellerService.markKycApprovalPageSeen("seller-404")
    ).rejects.toThrow("Seller record not found");

    expect(sellerModel.markKycApprovalPageSeenByUserId).not.toHaveBeenCalled();
  });

  it("throws when the seller is not yet approved (pending)", async () => {
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

  it("throws when the seller was rejected", async () => {
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

    expect(result.kyc_approval_page_seen).toBe(true);
    expect(sellerModel.markKycApprovalPageSeenByUserId).toHaveBeenCalledWith(
      "seller-1"
    );
  });
});
