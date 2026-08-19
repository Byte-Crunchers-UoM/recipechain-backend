// src/test/tests/payments/xrpRateService.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";

// xrpRateService.js calls the global fetch() directly (no axios/http client
// module to vi.mock), so we stub globalThis.fetch per test.
describe("xrpRateService", () => {
  let getXrpUsdRate;
  let convertUsdToXrp;
  let convertXrpToUsd;

  beforeEach(async () => {
    vi.resetModules();
    // Force a fresh cache (the module caches the last quote in a
    // module-level variable) and a predictable cache window.
    process.env.XRP_RATE_CACHE_MS = "60000";
    globalThis.fetch = vi.fn();

    const mod = await import("../../../services/xrpRateService.js");
    getXrpUsdRate = mod.getXrpUsdRate;
    convertUsdToXrp = mod.convertUsdToXrp;
    convertXrpToUsd = mod.convertXrpToUsd;
  });

  describe("getXrpUsdRate", () => {
    it("fetches and returns the live XRP/USD rate on success", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ripple: { usd: 0.5 } }),
      });

      const quote = await getXrpUsdRate();

      expect(quote.xrpUsdRate).toBe(0.5);
      expect(quote.source).toBe("coingecko");
      expect(quote.cached).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("serves a cached quote on the next call within the cache window", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ripple: { usd: 0.5 } }),
      });

      await getXrpUsdRate();
      const second = await getXrpUsdRate();

      expect(second.cached).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws when the price provider responds with a non-OK status", async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 503 });

      await expect(getXrpUsdRate()).rejects.toThrow(
        "Failed to fetch live XRP/USD rate. Status: 503"
      );
    });

    it("throws when the provider returns an invalid/zero rate", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ripple: { usd: 0 } }),
      });

      await expect(getXrpUsdRate()).rejects.toThrow(
        "Invalid XRP/USD rate received from price API"
      );
    });

    it("propagates a network-level fetch failure", async () => {
      globalThis.fetch.mockRejectedValue(new Error("network unreachable"));

      await expect(getXrpUsdRate()).rejects.toThrow("network unreachable");
    });
  });

  describe("convertUsdToXrp", () => {
    it("converts a USD amount to XRP using the live rate", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ripple: { usd: 0.5 } }),
      });

      const result = await convertUsdToXrp(10);

      expect(result.usdAmount).toBe(10);
      expect(result.amountXrp).toBe(20);
      expect(result.xrpUsdRate).toBe(0.5);
    });

    it("rejects a zero or negative USD amount", async () => {
      await expect(convertUsdToXrp(0)).rejects.toThrow(
        "USD amount must be greater than 0"
      );
      await expect(convertUsdToXrp(-5)).rejects.toThrow(
        "USD amount must be greater than 0"
      );
    });

    it("propagates a provider failure", async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(convertUsdToXrp(10)).rejects.toThrow(
        "Failed to fetch live XRP/USD rate. Status: 500"
      );
    });
  });

  describe("convertXrpToUsd", () => {
    it("converts an XRP amount to USD using the live rate", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ripple: { usd: 0.5 } }),
      });

      const result = await convertXrpToUsd(20);

      expect(result.amountXrp).toBe(20);
      expect(result.usdAmount).toBe(10);
      expect(result.xrpUsdRate).toBe(0.5);
    });

    it("rejects a zero or negative XRP amount", async () => {
      await expect(convertXrpToUsd(0)).rejects.toThrow(
        "XRP amount must be greater than 0"
      );
    });

    it("propagates a provider failure", async () => {
      globalThis.fetch.mockRejectedValue(new Error("provider down"));

      await expect(convertXrpToUsd(20)).rejects.toThrow("provider down");
    });
  });
});
