// src/test/tests/payments/walletService.purchase.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb } from "./mockDb.helper.js";

const { mockLogActivity, mockSendXrpFromTreasury } = vi.hoisted(() => ({
  mockLogActivity: vi.fn(),
  mockSendXrpFromTreasury: vi.fn(),
}));

let mockDb;
let chains;

vi.mock("../../../config/supabase.js", () => ({
  // walletService.js does `const db = supabaseAdmin || supabase;` once at
  // module-load time, so supabaseAdmin itself must stay a stable object;
  // its .from() delegates to whatever mockDb the current test configured.
  supabaseAdmin: {
    from: (...args) => mockDb.from(...args),
  },
  supabase: {},
}));

vi.mock("../../../services/xrplService.js", () => ({
  default: {
    getXrpBalance: vi.fn(),
    sendXrpFromTreasury: mockSendXrpFromTreasury,
  },
}));

vi.mock("../../../services/activityService.js", () => ({
  default: {
    logActivity: mockLogActivity,
    getUserActivities: vi.fn(),
  },
}));

import walletService from "../../../services/walletService.js";

const BUYER_ID = "buyer-1";
const RECIPE_ID = "recipe-1";
const SELLER_ID = "seller-1";

function buyerRow(balance = 100) {
  return {
    user_id: BUYER_ID,
    account_balance: balance,
    total_purchases: 2,
    total_spent_xrp: 40,
  };
}

function recipeRow(price = 20) {
  return {
    recipe_id: RECIPE_ID,
    title: "Chicken Curry",
    price,
    chef_id: SELLER_ID,
    status: "active",
  };
}

function sellerRow() {
  return {
    user_id: SELLER_ID,
    account_balance: 5,
    total_sales: 3,
    earnings_xrp: 15,
  };
}

describe("walletService.buyRecipeWithBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
    mockLogActivity.mockResolvedValue({ activity_id: "activity-1" });
  });

  it("completes a purchase when the buyer has sufficient balance, splitting commission", async () => {
    mockDb = createMockDb(
      {
        buyers: [
          { data: buyerRow(100), error: null }, // requireBuyer
          { error: null }, // buyers.update
        ],
        recipes: [{ data: recipeRow(20), error: null }],
        recipe_purchases: [
          { data: null, error: null }, // no existing purchase
          { error: null }, // insert
        ],
        payments: [
          {
            data: {
              payment_id: "payment-1",
              buyer_id: BUYER_ID,
              seller_id: SELLER_ID,
              recipe_id: RECIPE_ID,
              amount: 20,
              commission_amount: 2,
              seller_amount: 18,
              status: "completed",
              payment_type: "recipe_purchase",
            },
            error: null,
          },
        ],
        sellers: [
          { data: sellerRow(), error: null }, // select seller
          { error: null }, // update seller
        ],
        wallet_transactions: [
          { data: null, error: null }, // ensurePurchaseLedgerEntry existing-by-reference check
          {
            data: { transaction_id: "wt-1" },
            error: null,
          }, // createWalletTransaction insert
        ],
        user_activities: [{ data: null, error: null }], // existingActivity check
      },
      chains
    );

    const result = await walletService.buyRecipeWithBalance(BUYER_ID, RECIPE_ID);

    expect(result.newBalance).toBe(80);
    expect(result.commissionAmount).toBe(2);
    expect(result.sellerAmount).toBe(18);
    // commission math: seller amount + commission == total price
    expect(result.commissionAmount + result.sellerAmount).toBeCloseTo(20, 6);

    // buyer balance debited by the price
    expect(chains.buyers[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ account_balance: 80 })
    );

    // seller credited with sellerAmount
    expect(chains.sellers[1].update).toHaveBeenCalledWith(
      expect.objectContaining({
        account_balance: 5 + 18,
        earnings_xrp: 15 + 18,
      })
    );

    // a wallet_transactions row was written for the purchase
    const insertedTx = chains.wallet_transactions[1].insert.mock.calls[0][0][0];
    expect(insertedTx).toMatchObject({
      user_id: BUYER_ID,
      type: "purchase",
      direction: "debit",
      amount: 20,
      reference_table: "payments",
      reference_id: "payment-1",
    });

    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });

  it("rejects the purchase when the buyer's balance is insufficient", async () => {
    mockDb = createMockDb(
      {
        buyers: [{ data: buyerRow(5), error: null }],
        recipes: [{ data: recipeRow(20), error: null }],
        recipe_purchases: [{ data: null, error: null }],
      },
      chains
    );

    await expect(
      walletService.buyRecipeWithBalance(BUYER_ID, RECIPE_ID)
    ).rejects.toThrow("Insufficient balance");

    // no buyer debit, no payment row, must fail before any writes
    expect(chains.buyers).toHaveLength(1);
    expect(chains.payments).toBeUndefined();
  });

  it("rejects a purchase of a recipe the buyer already owns", async () => {
    mockDb = createMockDb(
      {
        buyers: [{ data: buyerRow(100), error: null }],
        recipes: [{ data: recipeRow(20), error: null }],
        recipe_purchases: [
          { data: { purchase_id: "purchase-existing" }, error: null },
        ],
      },
      chains
    );

    await expect(
      walletService.buyRecipeWithBalance(BUYER_ID, RECIPE_ID)
    ).rejects.toThrow("You already purchased this recipe");

    expect(chains.payments).toBeUndefined();
  });

  it("FINDING: a free recipe (price 0) is rejected rather than granted for free", async () => {
    // buyRecipeWithBalance calls toAmount(recipe.price) immediately after
    // loading the recipe, and toAmount() throws for any value <= 0. There
    // is no free-recipe short-circuit in the actual implementation, so a
    // recipe priced at 0 cannot be "purchased" through this path at all.
    mockDb = createMockDb(
      {
        buyers: [{ data: buyerRow(100), error: null }],
        recipes: [{ data: recipeRow(0), error: null }],
      },
      chains
    );

    await expect(
      walletService.buyRecipeWithBalance(BUYER_ID, RECIPE_ID)
    ).rejects.toThrow("Amount must be greater than 0");

    // never even reaches the already-purchased check
    expect(chains.recipe_purchases).toBeUndefined();
  });

  it("swallows an activityService.logActivity failure without failing the purchase", async () => {
    mockLogActivity.mockRejectedValue(new Error("activity log service down"));

    mockDb = createMockDb(
      {
        buyers: [
          { data: buyerRow(100), error: null },
          { error: null },
        ],
        recipes: [{ data: recipeRow(20), error: null }],
        recipe_purchases: [
          { data: null, error: null },
          { error: null },
        ],
        payments: [
          {
            data: {
              payment_id: "payment-2",
              buyer_id: BUYER_ID,
              seller_id: SELLER_ID,
              recipe_id: RECIPE_ID,
              amount: 20,
              commission_amount: 2,
              seller_amount: 18,
              status: "completed",
            },
            error: null,
          },
        ],
        sellers: [
          { data: sellerRow(), error: null },
          { error: null },
        ],
        wallet_transactions: [
          { data: null, error: null },
          { data: { transaction_id: "wt-2" }, error: null },
        ],
        user_activities: [{ data: null, error: null }],
      },
      chains
    );

    const result = await walletService.buyRecipeWithBalance(BUYER_ID, RECIPE_ID);

    // the purchase still succeeds even though activity logging rejected
    expect(result.newBalance).toBe(80);
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });
});
