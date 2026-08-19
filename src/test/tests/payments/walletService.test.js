// src/test/tests/payments/walletService.test.js
//
// Covers walletService.js: buyRecipeWithBalance (commission split + duplicate-purchase
// guard), applySuccessfulTopup (idempotency by external_reference, XRPL auto-fund
// resilience), requestWithdrawal (insufficient balance), requestRefund (duplicate
// refund behavior — verifying whether a guard actually exists), and
// ensurePurchaseLedgerEntry (idempotency by reference_table/reference_id and by tx_hash).
//
// Supabase is mocked entirely. No real network/XRPL/Supabase calls are made.

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NODE_ENV = "test";

const { mockSendXrpFromTreasury, mockLogActivity } = vi.hoisted(() => ({
  mockSendXrpFromTreasury: vi.fn(),
  mockLogActivity: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: (...args) => mockFrom(...args) },
  supabaseAdmin: null,
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

// xrpRateService is re-exported by walletService but not exercised by the
// functions under test here — mock it out so no real fetch() can happen.
vi.mock("../../../services/xrpRateService.js", () => ({
  default: {
    getXrpUsdRate: vi.fn(),
    convertUsdToXrp: vi.fn(),
    convertXrpToUsd: vi.fn(),
  },
}));

/**
 * A thenable "query chain" stand-in for the Supabase query builder.
 * Every chained method call (select/eq/insert/update/order/limit/in/maybeSingle/single)
 * returns another instance of the same chain; awaiting it (or calling .then)
 * resolves to `result`. This lets a single mock represent an arbitrarily long
 * chain without hand-modelling every method combination.
 */
function chain(result) {
  const promise = Promise.resolve(result);
  const proxy = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

let walletService;

beforeEach(async () => {
  vi.clearAllMocks();
  mockLogActivity.mockResolvedValue({});
  mockSendXrpFromTreasury.mockResolvedValue({ hash: "XRPL_FUNDING_HASH" });

  // walletService reads PLATFORM_COMMISSION_RATE and AUTO_FUND_XRPL_ON_TOPUP as
  // module-level constants at import time, so each test re-imports the module
  // fresh (after setting env vars) to control those values deterministically.
  process.env.PLATFORM_COMMISSION_RATE = "0.15";
  process.env.AUTO_FUND_XRPL_ON_TOPUP = "true";

  vi.resetModules();
  walletService = (await import("../../../services/walletService.js")).default;
});

describe("walletService.buyRecipeWithBalance", () => {
  it("splits the price into seller/commission using PLATFORM_COMMISSION_RATE and debits the buyer", async () => {
    // ARRANGE — call order inside buyRecipeWithBalance:
    // buyers(select) -> recipes(select) -> recipe_purchases(select existing)
    // -> buyers(update) -> payments(insert) -> sellers(select) -> sellers(update)
    // -> recipe_purchases(insert) -> ensurePurchaseLedgerEntry(...)
    mockFrom
      .mockImplementationOnce(() =>
        chain({
          data: { user_id: "buyer-1", account_balance: 100, total_purchases: 2, total_spent_xrp: 20 },
          error: null,
        })
      )
      .mockImplementationOnce(() =>
        chain({
          data: { recipe_id: "r1", title: "Cake", price: 10, chef_id: "seller-1", status: "approved" },
          error: null,
        })
      )
      .mockImplementationOnce(() => chain({ data: null, error: null })) // no existing purchase
      .mockImplementationOnce(() => chain({ error: null })) // buyers update
      .mockImplementationOnce(() =>
        chain({ data: { payment_id: "pay-1", recipe_id: "r1", amount: 10, payment_hash: null }, error: null })
      ) // payments insert
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "seller-1", account_balance: 5, total_sales: 1, earnings_xrp: 5 }, error: null })
      ) // sellers select
      .mockImplementationOnce(() => chain({ error: null })) // sellers update
      .mockImplementationOnce(() => chain({ error: null })) // recipe_purchases insert
      .mockImplementationOnce(() => chain({ data: null, error: null })) // ledger: existingByReference
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-1" }, error: null })) // ledger insert
      .mockImplementationOnce(() => chain({ data: null, error: null })); // activity dup check

    // ACT
    const result = await walletService.buyRecipeWithBalance("buyer-1", "r1");

    // ASSERT — price 10 * 0.15 commission rate
    expect(result.commissionAmount).toBe(1.5);
    expect(result.sellerAmount).toBe(8.5);
    expect(result.newBalance).toBe(90);
    expect(result.payment.payment_id).toBe("pay-1");
  });

  it("rejects the purchase when the buyer's balance is below the recipe price", async () => {
    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 5, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { recipe_id: "r1", title: "Cake", price: 10, chef_id: "seller-1", status: "approved" }, error: null })
      )
      .mockImplementationOnce(() => chain({ data: null, error: null })); // no existing purchase

    await expect(walletService.buyRecipeWithBalance("buyer-1", "r1")).rejects.toThrow(
      "Insufficient balance"
    );

    // Only 3 db.from calls should have happened — no balance mutation attempted.
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it("rejects re-purchasing a recipe the buyer already owns (idempotency by buyer+recipe)", async () => {
    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 100, total_purchases: 1, total_spent_xrp: 10 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { recipe_id: "r1", title: "Cake", price: 10, chef_id: "seller-1", status: "approved" }, error: null })
      )
      .mockImplementationOnce(() => chain({ data: { purchase_id: "existing-purchase" }, error: null }));

    await expect(walletService.buyRecipeWithBalance("buyer-1", "r1")).rejects.toThrow(
      "You already purchased this recipe"
    );
  });
});

describe("walletService.applySuccessfulTopup (Stripe webhook idempotency)", () => {
  it("credits the buyer balance, records the topup, and auto-funds the XRPL wallet on first processing", async () => {
    // requireBuyer -> getUserWallet -> topup_orders(select existing by externalReference)
    // -> buyers(update) -> [xrplService.sendXrpFromTreasury] -> topup_orders(insert)
    // -> wallet_transactions(insert) -> activityService.logActivity
    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 50, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", email: "b@test.com", wallet_address: "rBuyerWallet", role: "buyer" }, error: null })
      )
      .mockImplementationOnce(() => chain({ data: null, error: null })) // no existing topup for this session
      .mockImplementationOnce(() => chain({ data: { account_balance: 70 }, error: null })) // buyers update
      .mockImplementationOnce(() => chain({ data: { topup_id: "topup-1" }, error: null })) // topup insert
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-topup" }, error: null })); // wallet_transactions insert

    const result = await walletService.applySuccessfulTopup({
      userId: "buyer-1",
      amountXrp: 20,
      usdAmount: 10,
      xrpUsdRate: 0.5,
      externalReference: "cs_test_session_1",
    });

    expect(result.alreadyProcessed).toBeUndefined();
    expect(result.newBalance).toBe(70);
    expect(mockSendXrpFromTreasury).toHaveBeenCalledWith({
      destination: "rBuyerWallet",
      amountXrp: 20,
    });
    expect(result.txHash).toBe("XRPL_FUNDING_HASH");
  });

  it("does not double-credit when the same Stripe session id (external_reference) is replayed", async () => {
    // requireBuyer -> getUserWallet -> topup_orders(select existing) FOUND -> requireBuyer again
    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 70, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", email: "b@test.com", wallet_address: "rBuyerWallet", role: "buyer" }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({
          data: { topup_id: "topup-1", amount_credited: 20, status: "completed", tx_hash: "XRPL_FUNDING_HASH" },
          error: null,
        })
      ) // existing topup found for this external_reference
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 70, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      ); // latestBuyer re-read

    const result = await walletService.applySuccessfulTopup({
      userId: "buyer-1",
      amountXrp: 20,
      usdAmount: 10,
      xrpUsdRate: 0.5,
      externalReference: "cs_test_session_1",
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.newBalance).toBe(70); // unchanged — no second credit
    expect(mockSendXrpFromTreasury).not.toHaveBeenCalled(); // no second XRPL funding attempt
    // Only 4 db.from calls: no buyers.update / topup insert / wallet_transactions insert happened.
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it("still completes the topup and records the error when XRPL auto-funding fails", async () => {
    mockSendXrpFromTreasury.mockRejectedValueOnce(new Error("XRPL network unreachable"));

    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 50, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", email: "b@test.com", wallet_address: "rBuyerWallet", role: "buyer" }, error: null })
      )
      .mockImplementationOnce(() => chain({ data: null, error: null }))
      .mockImplementationOnce(() => chain({ data: { account_balance: 70 }, error: null }))
      .mockImplementationOnce(() => chain({ data: { topup_id: "topup-2" }, error: null }))
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-topup-2" }, error: null }));

    const result = await walletService.applySuccessfulTopup({
      userId: "buyer-1",
      amountXrp: 20,
      externalReference: "cs_test_session_2",
    });

    expect(result.newBalance).toBe(70); // balance credit still applied
    expect(result.xrplFundingError).toBe("XRPL network unreachable");
    expect(result.txHash).toBeNull(); // no funding hash since funding failed and no explicit txHash was passed
  });
});

describe("walletService.requestWithdrawal", () => {
  it("rejects a withdrawal request that exceeds the available balance", async () => {
    mockFrom.mockImplementationOnce(() =>
      chain({ data: { user_id: "buyer-1", account_balance: 5, total_purchases: 0, total_spent_xrp: 0 }, error: null })
    );

    await expect(
      walletService.requestWithdrawal("buyer-1", { amount: 100, destinationWallet: "rDestWallet" })
    ).rejects.toThrow("Insufficient balance");

    // Only the balance read happened — no withdrawal_requests insert.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("creates a pending withdrawal request and a matching wallet_transactions row when balance is sufficient", async () => {
    mockFrom
      .mockImplementationOnce(() =>
        chain({ data: { user_id: "buyer-1", account_balance: 100, total_purchases: 0, total_spent_xrp: 0 }, error: null })
      )
      .mockImplementationOnce(() =>
        chain({ data: { withdrawal_id: "wd-1", status: "pending", amount: 30 }, error: null })
      )
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-wd" }, error: null }));

    const result = await walletService.requestWithdrawal("buyer-1", {
      amount: 30,
      destinationWallet: "rDestWallet",
    });

    expect(result.status).toBe("pending");
    expect(result.withdrawal_id).toBe("wd-1");
  });
});

describe("walletService.requestRefund (verifying duplicate-refund protection)", () => {
  it("FINDING: creates a second refund_requests row for the same payment with no duplicate guard", async () => {
    const payment = { payment_id: "pay-1", buyer_id: "buyer-1", amount: 10 };

    // First call: payments(select) -> refund_requests(insert) -> wallet_transactions(insert)
    mockFrom
      .mockImplementationOnce(() => chain({ data: payment, error: null }))
      .mockImplementationOnce(() => chain({ data: { refund_id: "refund-1", status: "pending" }, error: null }))
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-refund-1" }, error: null }));

    const first = await walletService.requestRefund("buyer-1", { paymentId: "pay-1", reason: "not as described" });
    expect(first.refund_id).toBe("refund-1");

    // Second call with the SAME paymentId — walletService.requestRefund has no
    // pre-check against an existing pending/approved refund_requests row for
    // this payment_id, so it succeeds again and creates a second refund request.
    mockFrom
      .mockImplementationOnce(() => chain({ data: payment, error: null }))
      .mockImplementationOnce(() => chain({ data: { refund_id: "refund-2", status: "pending" }, error: null }))
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-refund-2" }, error: null }));

    const second = await walletService.requestRefund("buyer-1", { paymentId: "pay-1", reason: "still not right" });

    // ASSERT: both requests succeeded — no duplicate-refund guard exists.
    expect(second.refund_id).toBe("refund-2");
    expect(first.refund_id).not.toBe(second.refund_id);
  });
});

describe("walletService.ensurePurchaseLedgerEntry (idempotency for the wallet ledger)", () => {
  it("returns the existing ledger row and skips inserting a new one when reference_table+reference_id already exists", async () => {
    mockFrom.mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-existing" }, error: null }));

    const result = await walletService.ensurePurchaseLedgerEntry({
      userId: "buyer-1",
      paymentId: "pay-1",
      recipeId: "r1",
      amount: 10,
    });

    expect(result).toEqual({ transaction_id: "wtx-existing" });
    // Only the reference lookup ran — no insert call.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("returns the existing ledger row found by tx_hash when reference lookup misses (cross-check for XRPL tx replay)", async () => {
    mockFrom
      .mockImplementationOnce(() => chain({ data: null, error: null })) // no match by reference
      .mockImplementationOnce(() => chain({ data: { transaction_id: "wtx-by-hash" }, error: null })); // match by tx_hash

    const result = await walletService.ensurePurchaseLedgerEntry({
      userId: "buyer-1",
      paymentId: "pay-2",
      recipeId: "r2",
      amount: 10,
      txHash: "SAME_TX_HASH",
    });

    expect(result).toEqual({ transaction_id: "wtx-by-hash" });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
