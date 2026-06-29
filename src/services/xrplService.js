// src/services/xrplService.js

import xrpl from "xrpl";

const networkUrl =
  process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";

const treasurySecret = process.env.XRPL_TREASURY_SECRET;
const treasuryAddress = process.env.XRPL_TREASURY_ADDRESS;

const requireTreasuryConfig = () => {
  if (!treasurySecret) {
    throw new Error("Missing XRPL_TREASURY_SECRET");
  }

  if (!treasuryAddress) {
    throw new Error("Missing XRPL_TREASURY_ADDRESS");
  }
};

const withClient = async (callback) => {
  const client = new xrpl.Client(networkUrl);

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.disconnect();
  }
};

export const getXrpBalance = async (address) => {
  const walletAddress = String(address || "").trim();

  if (!walletAddress) {
    return {
      walletAddress: "",
      balanceXrp: null,
      balanceDrops: null,
      status: "missing_wallet",
      message: "Wallet address is missing",
    };
  }

  if (!xrpl.isValidClassicAddress(walletAddress)) {
    return {
      walletAddress,
      balanceXrp: null,
      balanceDrops: null,
      status: "invalid_wallet",
      message: "Invalid XRPL wallet address",
    };
  }

  try {
    return await withClient(async (client) => {
      const response = await client.request({
        command: "account_info",
        account: walletAddress,
        ledger_index: "validated",
      });

      const balanceDrops = response?.result?.account_data?.Balance;
      const balanceXrp = Number(xrpl.dropsToXrp(balanceDrops || "0"));

      return {
        walletAddress,
        balanceXrp: Number(balanceXrp.toFixed(6)),
        balanceDrops: balanceDrops || "0",
        status: "ok",
        message: null,
        ledgerIndex: response?.result?.ledger_index || null,
        networkUrl,
      };
    });
  } catch (error) {
    const errorCode = error?.data?.error || error?.error || error?.message || "";

    if (String(errorCode).includes("actNotFound")) {
      return {
        walletAddress,
        balanceXrp: 0,
        balanceDrops: "0",
        status: "not_activated",
        message: "This XRPL Testnet account is not activated yet",
        networkUrl,
      };
    }

    throw error;
  }
};

export const sendXrpFromTreasury = async ({ destination, amountXrp }) => {
  requireTreasuryConfig();

  if (!destination || typeof destination !== "string") {
    throw new Error("Destination wallet address is required");
  }

  if (!xrpl.isValidClassicAddress(destination)) {
    throw new Error("Invalid destination XRPL wallet address");
  }

  const amount = Number(amountXrp);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid XRP amount");
  }

  return withClient(async (client) => {
    const wallet = xrpl.Wallet.fromSeed(treasurySecret);

    if (wallet.address !== treasuryAddress) {
      console.warn("XRPL treasury address does not match the configured seed", {
        configuredTreasuryAddress: treasuryAddress,
        seedDerivedAddress: wallet.address,
      });
    }

    const tx = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: destination,
      Amount: xrpl.xrpToDrops(amount),
    };

    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const txResult =
      typeof result?.result?.meta === "string"
        ? result.result.meta
        : result?.result?.meta?.TransactionResult;

    if (txResult && txResult !== "tesSUCCESS") {
      throw new Error(`XRPL treasury payment failed: ${txResult}`);
    }

    return {
      hash: result?.result?.hash || null,
      result,
    };
  });
};

export default {
  getXrpBalance,
  sendXrpFromTreasury,
};