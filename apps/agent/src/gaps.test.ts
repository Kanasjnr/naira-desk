import { USDT, WARS } from "@naira-desk/shared";
import { describe, expect, it } from "vitest";
import levels from "./fixtures/levels.json" with { type: "json" };
import {
  bestGap,
  gasInUsdt,
  ladderBuys,
  ladderFor,
  MARKETS,
  type Market,
  type PoolQuoter,
} from "./gaps.ts";
import type { Ladder } from "./rfq.ts";

// Textile's wARS and CELO ladders on Celo, 26 Oct 2026 14:15 UTC.
const ladders = levels.pairs as Ladder[];
const wars = ladderFor(ladders, USDT, WARS);
const market = MARKETS.find((m) => m.name === "wARS") as Market;
if (!wars) throw new Error("fixture has no USDT -> wARS ladder");

// A pool paying 1.5% more than the maker's first rate, until it runs out of USD₮.
const pool =
  (runsOutAt = 10n ** 18n): PoolQuoter =>
  async (_, amount) => {
    const pays = (amount * 1_015_000n) / 1_668_231_066_205_299_493_808n;
    return pays < runsOutAt ? pays : runsOutAt;
  };

describe("ladderBuys", () => {
  it("reads a published point exactly", () => {
    expect(ladderBuys(wars, 1_471_655n)).toBe(2_455_058_410_552_272_522_515n);
  });

  it("reads between points", () => {
    expect(ladderBuys(wars, 500_000n)).toBe(834_115_533_102_649_746_904n);
  });

  it("has nothing past the maker's depth", () => {
    expect(ladderBuys(wars, 29_433_116n)).toBeUndefined();
  });
});

describe("bestGap", () => {
  it("spends the whole budget while the pool keeps paying more", async () => {
    const gap = await bestGap(market, wars, 10_000_000n, pool());
    expect(gap?.spend).toBe(10_000_000n);
    expect(gap?.bought).toBe(ladderBuys(wars, 10_000_000n));
    expect(gap?.profit).toBeGreaterThan(140_000n);
    expect(gap?.profit).toBeLessThan(160_000n);
  });

  it("stops at the size the pool can still pay for", async () => {
    const gap = await bestGap(market, wars, 50_000_000n, pool(8_000_000n));
    expect(gap?.spend).toBe(7_358_278n);
  });

  it("never spends past the maker's depth", async () => {
    const gap = await bestGap(market, wars, 100_000_000n, pool());
    expect(gap?.spend).toBe(29_433_115n);
  });

  it("has nothing to try without a budget", async () => {
    expect(await bestGap(market, wars, 0n, pool())).toBeUndefined();
  });
});

describe("gasInUsdt", () => {
  // 350k gas at 200 gwei is 0.07 CELO, and the makers paid $0.07888 per CELO.
  it("prices a take's gas at the makers' CELO rate", () => {
    expect(gasInUsdt(ladders, 200_000_000_000n)).toBe(5_521n);
  });

  it("needs a CELO price", () => {
    expect(() => gasInUsdt([wars], 200_000_000_000n)).toThrow("no CELO price");
  });
});
