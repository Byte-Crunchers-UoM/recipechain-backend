import { describe, it, expect, vi, beforeEach } from "vitest";

function createChain(response) {
  const chain = {};
  ["select", "eq"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
  return chain;
}

let queues;

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn((table) => {
      const q = queues[table];
      if (!q || q.length === 0) {
        throw new Error(`Unexpected supabase.from call for table: ${table}`);
      }
      return q.shift();
    })
  }
}));

import { getDashboardStatsService } from "../../../services/dashboardService.js";

beforeEach(() => {
  vi.clearAllMocks();
  queues = {};
});

describe("dashboardService.getDashboardStatsService", () => {
  it("aggregates users/recipes/sellers/pending/transactions/revenue into the expected shape", async () => {
    queues = {
      users: [
        createChain({ count: 42, error: null }),
        createChain({ count: 5, error: null })
      ],
      recipes: [
        createChain({ count: 100, error: null }),
        createChain({ count: 7, error: null })
      ],
      sellers: [createChain({ count: 3, error: null })],
      payments: [
        createChain({ count: 250, error: null }),
        createChain({
          data: [{ amount: "10.5" }, { amount: "4.5" }],
          error: null
        })
      ]
    };

    const stats = await getDashboardStatsService();

    expect(stats).toEqual({
      totalUsers: 42,
      totalRecipes: 100,
      pendingApprovals: 10,
      Sellers: 5,
      totalTransactions: 250,
      platformRevenue: "15.00 XRP"
    });
  });

  it("defaults counts to 0 and revenue to 0.00 XRP when Supabase returns null counts/rows", async () => {
    queues = {
      users: [
        createChain({ count: null, error: null }),
        createChain({ count: null, error: null })
      ],
      recipes: [
        createChain({ count: null, error: null }),
        createChain({ count: null, error: null })
      ],
      sellers: [createChain({ count: null, error: null })],
      payments: [
        createChain({ count: null, error: null }),
        createChain({ data: [], error: null })
      ]
    };

    const stats = await getDashboardStatsService();

    expect(stats).toEqual({
      totalUsers: 0,
      totalRecipes: 0,
      pendingApprovals: 0,
      Sellers: 0,
      totalTransactions: 0,
      platformRevenue: "0.00 XRP"
    });
  });

  it("throws when an early count query returns an error", async () => {
    queues = {
      users: [
        createChain({ count: null, error: new Error("db down") }),
        createChain({ count: 0, error: null })
      ],
      recipes: [
        createChain({ count: 0, error: null }),
        createChain({ count: 0, error: null })
      ],
      sellers: [createChain({ count: 0, error: null })],
      payments: [
        createChain({ count: 0, error: null }),
        createChain({ data: [], error: null })
      ]
    };

    await expect(getDashboardStatsService()).rejects.toThrow(
      "Failed to fetch counts from Supabase"
    );
  });
});
