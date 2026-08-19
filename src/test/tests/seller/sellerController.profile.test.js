import { describe, it, expect, vi, beforeEach } from "vitest";

// sellerController.updateSeller (profile management — NOT KYC, which is covered elsewhere).
// Per src/controllers/sellerController.js: updateSeller whitelists a fixed set of fields
// from req.body (display_name, bio, profile_photo, full_name, nationality, address,
// phone_no, experince [sic — matches the actual typo'd field name in the code], social_links),
// drops any `undefined` values, and 400s if nothing valid was provided. There is no format/type
// validation beyond that (e.g. no email format check — email isn't even an editable field here).
//
// FINDING: src/routes/sellerRoutes.js registers `router.put('/:id', updateSeller)` with no
// requireSession/auth middleware and updateSeller never compares `id` against any
// authenticated caller identity — the same missing-ownership-check pattern documented for
// recipe update/delete. Captured below as an ACTUAL-behavior test, not asserted as correct.

let fromImpl;

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn((...args) => fromImpl(...args)),
  },
}));

vi.mock("../../../services/sellerService.js", () => ({
  default: {
    submitKyc: vi.fn(),
    getKycStatus: vi.fn(),
    markKycApprovalPageSeen: vi.fn(),
  },
}));

vi.mock("../../../utils/activityLogger.js", () => ({
  logActivity: vi.fn(),
}));

import { updateSeller } from "../../../controllers/sellerController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("sellerController.updateSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates allowed profile fields for a valid request", async () => {
    fromImpl = (table) => {
      expect(table).toBe("sellers");
      return {
        update: (payload) => {
          expect(payload).toEqual({
            display_name: "Chef Amal",
            bio: "I cook Sri Lankan food",
          });
          return {
            eq: (col, val) => {
              expect(col).toBe("user_id");
              expect(val).toBe("seller-1");
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    };

    const req = {
      params: { id: "seller-1" },
      body: { display_name: "Chef Amal", bio: "I cook Sri Lankan food" },
    };
    const res = createMockResponse();

    await updateSeller(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Seller updated successfully",
    });
  });

  it("rejects an update with no recognized/valid fields (400, no DB call made)", async () => {
    fromImpl = vi.fn();

    const req = { params: { id: "seller-1" }, body: {} };
    const res = createMockResponse();

    await updateSeller(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "No valid seller fields provided for update",
    });
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("ignores unknown/unwhitelisted fields and only forwards recognized profile fields", async () => {
    let capturedPayload;

    fromImpl = () => ({
      update: (payload) => {
        capturedPayload = payload;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    });

    const req = {
      params: { id: "seller-1" },
      body: {
        display_name: "Chef Amal",
        role: "admin", // not part of the whitelist — must be dropped
        account_balance: 999999, // not part of the whitelist — must be dropped
      },
    };
    const res = createMockResponse();

    await updateSeller(req, res);

    expect(capturedPayload).toEqual({ display_name: "Chef Amal" });
    expect(capturedPayload.role).toBeUndefined();
    expect(capturedPayload.account_balance).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when the database update fails", async () => {
    fromImpl = () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: new Error("connection lost") }),
      }),
    });

    const req = { params: { id: "seller-1" }, body: { bio: "Updated bio" } };
    const res = createMockResponse();

    await updateSeller(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorDetails: "connection lost" })
    );
  });

  it("FINDING (ownership gap): updates a DIFFERENT seller's profile with no session/identity check", async () => {
    // The `id` used to target the update comes solely from req.params.id; nothing in
    // updateSeller reads req.user or req.session to confirm the caller IS seller-victim.
    let capturedId;

    fromImpl = () => ({
      update: () => ({
        eq: (col, val) => {
          capturedId = val;
          return Promise.resolve({ error: null });
        },
      }),
    });

    const req = {
      params: { id: "seller-victim" }, // arbitrary target, not tied to any authenticated caller
      body: { display_name: "Overwritten by attacker" },
      user: { user_id: "seller-attacker" }, // present but never consulted by the controller
    };
    const res = createMockResponse();

    await updateSeller(req, res);

    expect(capturedId).toBe("seller-victim");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
