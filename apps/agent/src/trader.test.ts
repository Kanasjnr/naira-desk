import type { Hash } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import levels from "./fixtures/levels.json" with { type: "json" };
import type { Gap, PoolQuoter } from "./gaps.ts";
import type { Ladder } from "./rfq.ts";
import { createTrader, type Trade, type TraderOptions } from "./trader.ts";

// Textile's wARS and CELO ladders on Celo, 26 Oct 2026. At 200 gwei a take costs $0.005521.
const ladders = levels.pairs as Ladder[];
const GAS = 5_521n;
const CELO = 10n ** 18n;
const hash: Hash = `0x${"ab".repeat(32)}`;

// A pool paying `ppm` parts per million of the makers' first wARS rate.
const pool =
  (ppm: bigint): PoolQuoter =>
  async (_, amount) =>
    (amount * ppm) / 1_668_231_066_205_299_493_808n;

function setup(options: Partial<TraderOptions> = {}) {
  const trades: Trade[] = [];
  let clock = 1_800_000_000_000;
  const take = vi.fn(async (gap: Gap, _float: bigint, _minProfit: bigint) => ({
    hash,
    spent: gap.spend,
    received: gap.poolPays,
    gasPaid: 56n * 10n ** 15n,
  }));
  const trader = createTrader({
    ladders: async () => ladders,
    float: async () => 0n,
    gasPrice: async () => 200_000_000_000n,
    gasLeft: async () => CELO,
    poolPays: pool(1_015_000n),
    take,
    log: async (trade) => {
      trades.push(trade);
    },
    now: () => clock,
    ...options,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { trader, trades, take, advance };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("createTrader", () => {
  it("logs a gap before the Taker holds anything, without taking it", async () => {
    const { trader, trades, take } = setup();
    await trader.tick();
    expect(trades).toEqual([
      expect.objectContaining({ kind: "gap", market: "wARS", spend: "29433115", gas: String(GAS) }),
    ]);
    expect(take).not.toHaveBeenCalled();
  });

  it("takes the best gap the float covers, asking for at least its gas back", async () => {
    const { trader, trades, take } = setup({ float: async () => 10_000_000n });
    await trader.tick();
    expect(take).toHaveBeenCalledTimes(1);
    expect(take.mock.calls[0]?.[0].spend).toBe(10_000_000n);
    expect(take.mock.calls[0]?.[2]).toBe(GAS);
    expect(trades.map((trade) => trade.kind)).toEqual(["gap", "take"]);
    expect(trades[1]).toEqual(
      expect.objectContaining({ market: "wARS", spent: "10000000", txHash: hash }),
    );
  });

  it("skips a market with no gap at its smallest size", async () => {
    const poolPays = vi.fn(pool(995_000n));
    const { trader, trades } = setup({ poolPays, float: async () => 10_000_000n });
    await trader.tick();
    expect(poolPays).toHaveBeenCalledTimes(1);
    expect(trades).toEqual([]);
  });

  it("leaves a gap that doesn't pay for its gas", async () => {
    const { trader, trades, take } = setup({
      poolPays: pool(1_000_100n),
      float: async () => 50_000_000n,
    });
    await trader.tick();
    expect(trades).toEqual([]);
    expect(take).not.toHaveBeenCalled();
  });

  it("logs a miss and waits a minute before trying that market again", async () => {
    const take = vi.fn(async () => {
      throw new Error("the firm quote doesn't pay: NoProfit");
    });
    const { trader, trades, advance } = setup({ take, float: async () => 10_000_000n });
    await trader.tick();
    advance(15_000);
    await trader.tick();
    expect(take).toHaveBeenCalledTimes(1);
    advance(60_000);
    await trader.tick();
    expect(take).toHaveBeenCalledTimes(2);
    expect(trades.map((trade) => trade.kind)).toEqual(["gap", "miss", "miss"]);
    expect(trades[1]).toEqual(
      expect.objectContaining({
        reason: "the firm quote doesn't pay: NoProfit",
        spend: "10000000",
      }),
    );
  });

  it("only watches when takes are off", async () => {
    const { trader, trades, take } = setup({ takes: false, float: async () => 10_000_000n });
    await trader.tick();
    expect(trades.map((trade) => trade.kind)).toEqual(["gap"]);
    expect(take).not.toHaveBeenCalled();
  });

  it("keeps the agent's last 0.1 CELO for its reviews, and says so once", async () => {
    const { trader, trades, take, advance } = setup({
      float: async () => 10_000_000n,
      gasLeft: async () => CELO / 20n,
    });
    await trader.tick();
    advance(15_000);
    await trader.tick();
    expect(take).not.toHaveBeenCalled();
    expect(trades.map((trade) => trade.kind)).toEqual(["gap"]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("doesn't take under Textile's $1 minimum", async () => {
    const { trader, take } = setup({ float: async () => 500_000n });
    await trader.tick();
    expect(take).not.toHaveBeenCalled();
  });

  it("logs a gap that stays open at most every five minutes", async () => {
    const { trader, trades, advance } = setup();
    await trader.tick();
    advance(15_000);
    await trader.tick();
    expect(trades).toHaveLength(1);
    advance(5 * 60_000);
    await trader.tick();
    expect(trades).toHaveLength(2);
  });

  it("never runs two scans at once, and waits between them", async () => {
    const read = vi.fn(async () => ladders);
    const { trader, advance } = setup({ ladders: read });
    await Promise.all([trader.tick(), trader.tick()]);
    expect(read).toHaveBeenCalledTimes(1);
    await trader.tick();
    expect(read).toHaveBeenCalledTimes(1);
    advance(15_000);
    await trader.tick();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
