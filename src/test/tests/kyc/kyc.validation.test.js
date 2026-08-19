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

describe("sellerService.submitKyc - field/document validation", () => {
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

  // --- FINDING: no NIC format validation exists in sellerService.submitKyc.
  // The only check is "non-empty after trim" (src/services/sellerService.js
  // required-fields block, ~line 178). Any string is accepted as an NIC number.
  it("FINDING: accepts a clearly invalid NIC format (no format/regex validation enforced)", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: { ...validBody, nicNo: "abc" },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(result.verification_status).toBe("pending");
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({ nic_no: "abc" })
    );
  });

  // --- FINDING: no phone format validation exists either. normalizePhone()
  // (sellerService.js ~line 39) only strips non-digit/non-plus characters;
  // there is no length or pattern check before it is persisted.
  it("FINDING: accepts a clearly invalid phone number format (no format/regex validation enforced)", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: { ...validBody, phoneNo: "123" },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(result.verification_status).toBe("pending");
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({ phone_no_normalized: "123" })
    );
  });

  // --- FINDING: dateOfBirth is only checked for truthiness (sellerService.js
  // ~line 180), never parsed as a real date or checked for a minimum age.
  it("FINDING: accepts a non-date dateOfBirth string (no date/age validation enforced)", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: { ...validBody, dateOfBirth: "not-a-real-date" },
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(result.verification_status).toBe("pending");
    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({ date_of_birth: "not-a-real-date" })
    );
  });

  it("rejects an oversized front ID document over the 10MB limit", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [
            validFile("front.png", { size: 10 * 1024 * 1024 + 1 })
          ],
          idDocumentBack: [validFile("back.png")]
        }
      })
    ).rejects.toThrow("file size must be 10MB or less");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("rejects an oversized back ID document over the 10MB limit", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [validFile("front.png")],
          idDocumentBack: [
            validFile("back.png", { size: 10 * 1024 * 1024 + 1 })
          ]
        }
      })
    ).rejects.toThrow("file size must be 10MB or less");

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("accepts a file exactly at the 10MB boundary", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: validBody,
      files: {
        idDocumentFront: [validFile("front.png", { size: 10 * 1024 * 1024 })],
        idDocumentBack: [validFile("back.png", { size: 10 * 1024 * 1024 })]
      }
    });

    expect(result.verification_status).toBe("pending");
  });

  it("fails cleanly when Cloudinary upload rejects, and does not update the seller row", async () => {
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

  it("fails cleanly when the second (back document) Cloudinary upload rejects, and does not update the seller row", async () => {
    uploadBufferToCloudinary
      .mockResolvedValueOnce({
        secure_url: "https://cloudinary.test/front.png",
        public_id: "front-id"
      })
      .mockRejectedValueOnce(new Error("Cloudinary upload failed"));

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
});
