// src/test/tests/payments/xrplService.test.js
//
// Covers xrplService.js: getXrpBalance (invalid/missing/unactivated/ok wallet states)
// and sendXrpFromTreasury (missing treasury config, invalid destination, invalid
// amount, non-success ledger result, happy path). The `xrpl` npm package is fully
// mocked — no real XRPL testnet connection is made.
//
// xrplService reads XRPL_NETWORK / XRPL_TREASURY_SECRET / XRPL_TREASURY_ADDRESS as
// module-level constants at import time, so each test sets env vars and then
// re-imports the module fresh via vi.resetModules() + dynamic import.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockConnect,
  mockDisconnect,
  mockRequest,
  mockAutofill,
  mockSubmitAndWait,
  mockIsValidClassicAddress,
  mockWalletFromSeed,
} = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
  mockRequest: vi.fn(),
  mockAutofill: vi.fn(),
  mockSubmitAndWait: vi.fn(),
  mockIsValidClassicAddress: vi.fn(),
  mockWalletFromSeed: vi.fn(),
}));

vi.mock("xrpl", () => {
  function Client() {
    return {
      connect: mockConnect,
      disconnect: mockDisconnect,
      request: mockRequest,
      autofill: mockAutofill,
      submitAndWait: mockSubmitAndWait,
    };
  }

  return {
    default: {
      Client,
      isValidClassicAddress: mockIsValidClassicAddress,
      dropsToXrp: (drops) => Number(drops) / 1_000_000,
      xrpToDrops: (xrp) => String(Math.round(Number(xrp) * 1_000_000)),
      Wallet: { fromSeed: mockWalletFromSeed },
    },
  };
});

let xrplService;

async function importFresh(env = {}) {
  vi.resetModules();

  delete process.env.XRPL_NETWORK;
  delete process.env.XRPL_TREASURY_SECRET;
  delete process.env.XRPL_TREASURY_ADDRESS;

  Object.assign(process.env, env);

  xrplService = (await import("../../../services/xrplService.js")).default;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockDisconnect.mockResolvedValue(undefined);
  mockIsValidClassicAddress.mockReturnValue(true);
});

describe("xrplService.getXrpBalance", () => {
  it("returns missing_wallet status when no address is given", async () => {
    await importFresh();

    const result = await xrplService.getXrpBalance("");

    expect(result.status).toBe("missing_wallet");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("returns invalid_wallet status for a malformed XRPL address", async () => {
    await importFresh();
    mockIsValidClassicAddress.mockReturnValue(false);

    const result = await xrplService.getXrpBalance("not-a-real-address");

    expect(result.status).toBe("invalid_wallet");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("returns not_activated status when the ledger reports actNotFound", async () => {
    await importFresh();
    const notFoundError = new Error("Account not found.");
    notFoundError.data = { error: "actNotFound" };
    mockRequest.mockRejectedValue(notFoundError);

    const result = await xrplService.getXrpBalance("rValidButUnfundedAddress");

    expect(result.status).toBe("not_activated");
    expect(result.balanceXrp).toBe(0);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("returns the parsed XRP balance for a valid, activated account", async () => {
    await importFresh();
    mockRequest.mockResolvedValue({
      result: {
        account_data: { Balance: "25000000" },
        ledger_index: 12345,
      },
    });

    const result = await xrplService.getXrpBalance("rActiveAccount");

    expect(result.status).toBe("ok");
    expect(result.balanceXrp).toBe(25);
    expect(result.balanceDrops).toBe("25000000");
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("propagates unexpected ledger errors (not actNotFound) instead of swallowing them", async () => {
    await importFresh();
    mockRequest.mockRejectedValue(new Error("network timeout"));

    await expect(xrplService.getXrpBalance("rActiveAccount")).rejects.toThrow("network timeout");
    expect(mockDisconnect).toHaveBeenCalled(); // still disconnects via finally
  });
});

describe("xrplService.sendXrpFromTreasury", () => {
  it("throws when XRPL_TREASURY_SECRET is not configured", async () => {
    await importFresh({ XRPL_TREASURY_ADDRESS: "rTreasury" }); // secret intentionally omitted

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 10 })
    ).rejects.toThrow("Missing XRPL_TREASURY_SECRET");

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("throws when XRPL_TREASURY_ADDRESS is not configured", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed" }); // address intentionally omitted

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 10 })
    ).rejects.toThrow("Missing XRPL_TREASURY_ADDRESS");
  });

  it("rejects an invalid destination XRPL wallet address", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed", XRPL_TREASURY_ADDRESS: "rTreasury" });
    mockIsValidClassicAddress.mockReturnValue(false);

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "not-valid", amountXrp: 10 })
    ).rejects.toThrow("Invalid destination XRPL wallet address");
  });

  it("rejects a non-positive or non-finite XRP amount", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed", XRPL_TREASURY_ADDRESS: "rTreasury" });

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 0 })
    ).rejects.toThrow("Invalid XRP amount");

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: "not-a-number" })
    ).rejects.toThrow("Invalid XRP amount");
  });

  it("throws when the submitted ledger transaction result is not tesSUCCESS", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed", XRPL_TREASURY_ADDRESS: "rTreasury" });
    mockWalletFromSeed.mockReturnValue({ address: "rTreasury", sign: vi.fn(() => ({ tx_blob: "blob" })) });
    mockAutofill.mockResolvedValue({ TransactionType: "Payment" });
    mockSubmitAndWait.mockResolvedValue({
      result: { hash: "TXHASH", meta: { TransactionResult: "tecUNFUNDED_PAYMENT" } },
    });

    await expect(
      xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 5 })
    ).rejects.toThrow("XRPL treasury payment failed: tecUNFUNDED_PAYMENT");
  });

  it("sends a validated payment and returns the transaction hash on success", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed", XRPL_TREASURY_ADDRESS: "rTreasury" });
    mockWalletFromSeed.mockReturnValue({ address: "rTreasury", sign: vi.fn(() => ({ tx_blob: "blob" })) });
    mockAutofill.mockImplementation(async (tx) => tx);
    mockSubmitAndWait.mockResolvedValue({
      result: { hash: "TXHASH_OK", meta: { TransactionResult: "tesSUCCESS" } },
    });

    const result = await xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 5 });

    expect(result.hash).toBe("TXHASH_OK");
    expect(mockAutofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "Payment",
        Destination: "rDest",
        Amount: "5000000",
      })
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("warns (but still proceeds) when the seed-derived address does not match XRPL_TREASURY_ADDRESS", async () => {
    await importFresh({ XRPL_TREASURY_SECRET: "sTreasurySeed", XRPL_TREASURY_ADDRESS: "rConfiguredTreasury" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockWalletFromSeed.mockReturnValue({ address: "rDIFFERENT_ADDRESS", sign: vi.fn(() => ({ tx_blob: "blob" })) });
    mockAutofill.mockImplementation(async (tx) => tx);
    mockSubmitAndWait.mockResolvedValue({
      result: { hash: "TXHASH_MISMATCH", meta: { TransactionResult: "tesSUCCESS" } },
    });

    const result = await xrplService.sendXrpFromTreasury({ destination: "rDest", amountXrp: 5 });

    expect(result.hash).toBe("TXHASH_MISMATCH");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
