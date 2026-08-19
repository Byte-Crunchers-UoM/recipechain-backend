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

const validFile = (name = "id.png", size = 1024) => ({
  originalname: name,
  mimetype: "image/png",
  size,
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

describe("sellerService.submitKyc - additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sellerModel.findSellerByNicNormalized.mockResolvedValue(null);
    sellerModel.findSellerByPhoneNormalized.mockResolvedValue(null);
    uploadBufferToCloudinary.mockResolvedValue({
      secure_url: "https://cloudinary.test/id.png",
      public_id: "test-public-id"
    });
  });

  it("rejects an oversized front document without uploading anything", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png", 11 * 1024 * 1024)],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow("file size must be 10MB or less");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("rejects an oversized back document without uploading anything", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected"
    });

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [validFile("back.png", 12 * 1024 * 1024)]
        }
      })
    ).rejects.toThrow("file size must be 10MB or less");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("blocks resubmission while a previous submission is still pending review", async () => {
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

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("blocks resubmission for an already-approved seller", async () => {
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

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("allows resubmission after rejection and clears the previous rejection reason", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "rejected",
      rejection_reason: "Blurry NIC photo"
    });
    sellerModel.updateSellerByUserId.mockResolvedValue({
      user_id: "seller-1",
      verification_status: "pending",
      rejection_reason: null
    });

    const result = await sellerService.submitKyc({
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
        verified_at: null
      })
    );
    expect(result.verification_status).toBe("pending");
  });

  it("throws when no seller record exists for the authenticated user", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue(null);

    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile()],
          idDocumentBack: [validFile()]
        }
      })
    ).rejects.toThrow("Seller record not found");
  });

  it("only ever reads/writes the KYC record for the authenticated userId (never a caller-supplied id), so a caller cannot submit KYC on behalf of another seller", async () => {
    sellerModel.findSellerByUserId.mockResolvedValue({
      user_id: "authenticated-seller",
      verification_status: "rejected"
    });
    sellerModel.updateSellerByUserId.mockResolvedValue({
      user_id: "authenticated-seller",
      verification_status: "pending"
    });

    await sellerService.submitKyc({
      userId: "authenticated-seller",
      body: { ...validBody },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(sellerModel.findSellerByUserId).toHaveBeenCalledWith("authenticated-seller");
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "authenticated-seller",
      expect.any(Object)
    );
    expect(sellerModel.findSellerByUserId).not.toHaveBeenCalledWith(
      expect.stringMatching(/^(?!authenticated-seller$).+/)
    );
  });
});
