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

describe("sellerService.submitKyc", () => {
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

  it("rejects when required fields are missing", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: { ...validBody, fullName: "" },
        files: {
          idDocumentFront: [validFile()],
          idDocumentBack: [validFile()]
        }
      })
    ).rejects.toThrow("All required fields must be filled");
  });

  it("rejects when declaration checkboxes are not accepted", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: { ...validBody, agreeTerms: "false" },
        files: {
          idDocumentFront: [validFile()],
          idDocumentBack: [validFile()]
        }
      })
    ).rejects.toThrow("You must agree to the declarations");
  });

  it("rejects invalid file type", async () => {
    await expect(
      sellerService.submitKyc({
        userId: "seller-1",
        body: validBody,
        files: {
          idDocumentFront: [
            {
              ...validFile("virus.exe"),
              mimetype: "application/x-msdownload"
            }
          ],
          idDocumentBack: [validFile()]
        }
      })
    ).rejects.toThrow("only JPG, PNG and PDF files are allowed");
  });

  it("rejects duplicate NIC", async () => {
    sellerModel.findSellerByNicNormalized.mockResolvedValue({
      user_id: "other-seller",
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
    ).rejects.toMatchObject({
      name: "DuplicateSellerIdentityError",
      statusCode: 409,
      field: "nicNo"
    });
  });

  it("submits valid KYC and sets seller status to pending", async () => {
    const result = await sellerService.submitKyc({
      userId: "seller-1",
      body: validBody,
      files: {
        idDocumentFront: [validFile("front.png")],
        idDocumentBack: [validFile("back.png")]
      }
    });

    expect(uploadBufferToCloudinary).toHaveBeenCalledTimes(2);

    expect(sellerModel.updateSellerByUserId).toHaveBeenCalledWith(
      "seller-1",
      expect.objectContaining({
        full_name: "Amal Viduranga",
        verification_status: "pending",
        nic_no_normalized: "200012345678",
        phone_no_normalized: "+94753681070"
      })
    );

    expect(result.verification_status).toBe("pending");
  });
});