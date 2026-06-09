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

export const sendXrpFromTreasury = async ({ destination, amountXrp }) => {
  requireTreasuryConfig();

  if (!destination || typeof destination !== "string") {
    throw new Error("Destination wallet address is required");
  }

  const amount = Number(amountXrp);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid XRP amount");
  }

  const client = new xrpl.Client(networkUrl);

  await client.connect();

  try {
    const wallet = xrpl.Wallet.fromSeed(treasurySecret);

    const tx = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: destination,
      Amount: xrpl.xrpToDrops(amount),
    };

    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    return {
      hash: result?.result?.hash || null,
      result,
    };
  } finally {
    await client.disconnect();
  }
};

export default {
  sendXrpFromTreasury,
};