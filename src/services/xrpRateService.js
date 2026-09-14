// src/services/xrpRateService.js

const COINGECKO_SIMPLE_PRICE_URL =
  process.env.COINGECKO_SIMPLE_PRICE_URL ||
  "https://api.coingecko.com/api/v3/simple/price";

const XRP_COINGECKO_ID = process.env.XRP_COINGECKO_ID || "ripple";
const CACHE_MS = Number(process.env.XRP_RATE_CACHE_MS || 60_000);

let cachedQuote = null;
let cachedAt = 0;

const toPositiveAmount = (value, label = "Amount") => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }

  return amount;
};

const getOptionalHeaders = () => {
  const headers = {
    accept: "application/json",
  };

  const demoApiKey = String(process.env.COINGECKO_DEMO_API_KEY || "").trim();
  const proApiKey = String(process.env.COINGECKO_PRO_API_KEY || "").trim();

  if (demoApiKey) {
    headers["x-cg-demo-api-key"] = demoApiKey;
  }

  if (proApiKey) {
    headers["x-cg-pro-api-key"] = proApiKey;
  }

  return headers;
};

export const getXrpUsdRate = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();

  if (!forceRefresh && cachedQuote && now - cachedAt < CACHE_MS) {
    return {
      ...cachedQuote,
      cached: true,
    };
  }

  const url = new URL(COINGECKO_SIMPLE_PRICE_URL);
  url.searchParams.set("ids", XRP_COINGECKO_ID);
  url.searchParams.set("vs_currencies", "usd");

  const response = await fetch(url, {
    method: "GET",
    headers: getOptionalHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch live XRP/USD rate. Status: ${response.status}`
    );
  }

  const data = await response.json();
  const rate = Number(data?.[XRP_COINGECKO_ID]?.usd);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid XRP/USD rate received from price API");
  }

  cachedQuote = {
    xrpUsdRate: Number(rate.toFixed(6)),
    source: "coingecko",
    coinId: XRP_COINGECKO_ID,
    fetchedAt: new Date().toISOString(),
    cacheSeconds: Math.max(1, Math.round(CACHE_MS / 1000)),
  };

  cachedAt = now;

  return {
    ...cachedQuote,
    cached: false,
  };
};

export const convertUsdToXrp = async (usdAmount) => {
  const normalizedUsdAmount = Number(
    toPositiveAmount(usdAmount, "USD amount").toFixed(2)
  );

  const quote = await getXrpUsdRate();

  const amountXrp = Number((normalizedUsdAmount / quote.xrpUsdRate).toFixed(6));

  return {
    usdAmount: normalizedUsdAmount,
    amountXrp,
    ...quote,
  };
};

export const convertXrpToUsd = async (xrpAmount) => {
  const normalizedXrpAmount = Number(
    toPositiveAmount(xrpAmount, "XRP amount").toFixed(6)
  );

  const quote = await getXrpUsdRate();

  const usdAmount = Number((normalizedXrpAmount * quote.xrpUsdRate).toFixed(2));

  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error("Converted USD amount is invalid");
  }

  return {
    amountXrp: normalizedXrpAmount,
    usdAmount,
    ...quote,
  };
};

export default {
  getXrpUsdRate,
  convertUsdToXrp,
  convertXrpToUsd,
};