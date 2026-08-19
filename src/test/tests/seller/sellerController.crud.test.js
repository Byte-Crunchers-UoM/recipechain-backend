import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockLogActivity = vi.fn();

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: (...args) => mockFrom(...args)
  }
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: (...args) => mockLogActivity(...args)
}));

vi.mock("../../../services/sellerService.js", () => ({
  default: {
    submitKyc: vi.fn(),
    getKycStatus: vi.fn(),
    markKycApprovalPageSeen: vi.fn()
  }
}));

import {
  createSeller,
  getAllSellers,
  getSellerById,
  updateSeller,
  deleteSeller,
  verifySeller
} from "../../../controllers/sellerController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("sellerController.createSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * createSeller's insert payload for the "sellers" table references
   * `nic_no`, `id_document_front_url`, `id_document_back_url` and `experience`,
   * none of which are destructured from req.body (only `Nic_no`, `Id_photo_path`,
   * and `experince` are). Evaluating that object literal throws a ReferenceError
   * before supabase.from('sellers').insert() is ever invoked, so every call to
   * this endpoint currently fails with a 500 regardless of input. This test
   * documents that real, current behavior -- it is a production bug, not
   * something to fix here.
   */
  it("returns 500 due to a ReferenceError while building the sellers insert payload, so the sellers row is never inserted", async () => {
    const insertUsers = vi.fn().mockResolvedValue({ error: null });
    const insertSellers = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table) => {
      if (table === "users") return { insert: insertUsers };
      if (table === "sellers") return { insert: insertSellers };
      throw new Error(`Unexpected table: ${table}`);
    });

    const req = {
      body: {
        email: "seller@test.com",
        wallet_address: "rTestWallet",
        full_name: "Test Seller",
        nationality: "Sri Lankan",
        address: "Colombo",
        Nic_no: "200012345678",
        phone_no: "+94700000000",
        Id_photo_path: "https://example.com/id.png",
        bio: "Chef",
        display_name: "Chef Test",
        experince: "5 years",
        profile_photo: "",
        social_links: null
      }
    };
    const res = createMockResponse();

    await createSeller(req, res);

    expect(insertUsers).toHaveBeenCalled();
    expect(insertSellers).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.errorDetails).toMatch(/nic_no is not defined/i);
  });

  it("returns 500 when the initial users insert fails", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "users") {
        return { insert: vi.fn().mockResolvedValue({ error: { message: "duplicate email" } }) };
      }
    });

    const res = createMockResponse();
    await createSeller({ body: { email: "dup@test.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sellerController.getAllSellers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("combines seller rows with matching user data", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return {
          select: () =>
            Promise.resolve({
              data: [{ user_id: "seller-1", display_name: "Chef A" }],
              error: null
            })
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ user_id: "seller-1", email: "a@test.com", wallet_address: "rW" }],
                error: null
              })
          })
        };
      }
    });

    const res = createMockResponse();
    await getAllSellers({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data[0].users).toEqual({ email: "a@test.com", wallet_address: "rW" });
  });

  it("returns 500 when the sellers query fails", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return { select: () => Promise.resolve({ data: null, error: { message: "db down" } }) };
      }
    });

    const res = createMockResponse();
    await getAllSellers({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sellerController.getSellerById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns seller data joined with user data", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { user_id: "seller-1", display_name: "Chef A" },
                  error: null
                })
            })
          })
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { email: "a@test.com", wallet_address: "rW" },
                  error: null
                })
            })
          })
        };
      }
    });

    const res = createMockResponse();
    await getSellerById({ params: { id: "seller-1" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.users.email).toBe("a@test.com");
  });

  it("returns 404 when the seller is not found", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: null, error: { message: "not found" } })
            })
          })
        };
      }
    });

    const res = createMockResponse();
    await getSellerById({ params: { id: "missing" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("sellerController.updateSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no valid seller fields are provided", async () => {
    const res = createMockResponse();
    await updateSeller({ params: { id: "seller-1" }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  /**
   * sellerRoutes.js wires PUT /:id with no auth middleware at all, and this
   * handler updates whatever :id is supplied purely from req.params -- there
   * is no check that the caller owns the seller row being updated. This test
   * documents that gap concretely rather than asserting an ownership check
   * that doesn't exist.
   */
  it("updates any seller id supplied in the URL with no ownership check on the caller (route has no auth middleware)", async () => {
    const updateFn = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") return { update: updateFn };
    });

    const res = createMockResponse();
    await updateSeller(
      { params: { id: "someone-elses-seller-id" }, body: { display_name: "New Name" } },
      res
    );

    expect(updateFn).toHaveBeenCalledWith({ display_name: "New Name" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 on a database error", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return { update: () => ({ eq: () => Promise.resolve({ error: { message: "db error" } }) }) };
      }
    });

    const res = createMockResponse();
    await updateSeller({ params: { id: "seller-1" }, body: { bio: "x" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sellerController.deleteSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Same authorization gap as updateSeller: DELETE /:id has no auth
   * middleware, so any caller can delete any seller+user row by id.
   */
  it("deletes seller and user rows for any supplied id with no ownership/self check", async () => {
    const sellersDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const usersDeleteEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") return { delete: () => ({ eq: sellersDeleteEq }) };
      if (table === "users") return { delete: () => ({ eq: usersDeleteEq }) };
    });

    const res = createMockResponse();
    await deleteSeller({ params: { id: "seller-1" } }, res);

    expect(sellersDeleteEq).toHaveBeenCalledWith("user_id", "seller-1");
    expect(usersDeleteEq).toHaveBeenCalledWith("user_id", "seller-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when the sellers delete fails", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return { delete: () => ({ eq: () => Promise.resolve({ error: { message: "fail" } }) }) };
      }
    });

    const res = createMockResponse();
    await deleteSeller({ params: { id: "seller-1" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sellerController.verifySeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("approves a seller, clears the rejection reason, sets verified_at, and logs activity", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: () => ({
        select: () =>
          Promise.resolve({
            data: [{ user_id: "seller-1", verification_status: "approved" }],
            error: null
          })
      })
    });
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") return { update: updateFn };
    });

    const res = createMockResponse();
    await verifySeller({ params: { id: "seller-1" }, body: { status: "Approved" } }, res);

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        verification_status: "approved",
        rejection_reason: null
      })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      "Seller Verified",
      expect.stringContaining("seller-1"),
      "SELLER_VERIFICATION"
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a seller with a reason and logs the rejection", async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: () => ({
        select: () =>
          Promise.resolve({
            data: [{ user_id: "seller-1", verification_status: "rejected" }],
            error: null
          })
      })
    });
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") return { update: updateFn };
    });

    const res = createMockResponse();
    await verifySeller(
      { params: { id: "seller-1" }, body: { status: "rejected", rejection_reason: "Blurry NIC photo" } },
      res
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        verification_status: "rejected",
        rejection_reason: "Blurry NIC photo"
      })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      "Seller Rejected",
      expect.stringContaining("Blurry NIC photo"),
      "SELLER_REJECTION"
    );
  });

  it("returns 500 when the update fails", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "sellers") {
        return {
          update: () => ({
            eq: () => ({
              select: () => Promise.resolve({ data: null, error: { message: "db error" } })
            })
          })
        };
      }
    });

    const res = createMockResponse();
    await verifySeller({ params: { id: "seller-1" }, body: { status: "approved" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
