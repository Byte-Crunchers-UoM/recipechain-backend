import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockIn = vi.fn();

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: (...args) => mockFrom(...args)
  }
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn()
}));

import buyerService from "../../../services/buyerService.js";

function setupSupabaseMocks() {
  mockFrom.mockImplementation((table) => {
    if (table === "buyers") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  user_id: "buyer-1",
                  display_name: "",
                  bio: "Food lover",
                  profile_picture: "",
                  total_purchases: 2,
                  total_spent_xrp: 120,
                  account_balance: 50
                },
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
                data: {
                  user_id: "buyer-1",
                  email: "buyer@test.com",
                  wallet_address: "rTestWallet",
                  created_at: "2026-01-01",
                  role: "buyer"
                },
                error: null
              })
          })
        })
      };
    }

    if (table === "saved_recipes") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              count: 3,
              error: null
            })
        })
      };
    }

    if (table === "feedbacks") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              count: 1,
              error: null
            })
        })
      };
    }

    if (table === "payments") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      payment_id: "payment-1",
                      amount: 25,
                      status: "completed",
                      time_stamp: "2026-01-02",
                      recipe_id: "recipe-1"
                    }
                  ],
                  error: null
                })
            })
          })
        })
      };
    }

    if (table === "recipes") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [{ recipe_id: "recipe-1", title: "Milk Rice" }],
              error: null
            })
        })
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("buyerService.getBuyerProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMocks();
  });

  it("builds buyer profile with fallback display name and counts", async () => {
    const profile = await buyerService.getBuyerProfile({
      userId: "buyer-1"
    });

    expect(profile.email).toBe("buyer@test.com");
    expect(profile.wallet_address).toBe("rTestWallet");
    expect(profile.display_name).toBe("buyer@test.com");
    expect(profile.saved_recipes_count).toBe(3);
    expect(profile.feedback_count).toBe(1);
    expect(profile.recent_activity[0].title).toBe("Milk Rice");
  });
});