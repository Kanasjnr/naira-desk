import { describe, expect, it } from "vitest";
import { fairValue } from "./fair-value.ts";

const now = 1_760_000_000_000;
const point = (source: string, ngnPerUsdt: number, ageMs = 0) => ({
  source,
  price: 1 / ngnPerUsdt,
  at: now - ageMs,
});

describe("fairValue", () => {
  // The market on 24 Oct 2026: the pool held cNGN about 0.75% rich to the naira.
  it("prices at the pool while cNGN tracks the naira", () => {
    const result = fairValue(
      [point("uniswap", 1367.64), point("luno", 1377.8, 10_000), point("textile", 1379.5)],
      now,
    );
    expect(result).toEqual({
      ok: true,
      price: 1 / 1367.64,
      at: now - 10_000,
      sources: ["uniswap", "luno", "textile"],
    });
  });

  it("stops when cNGN drifts too far from the naira", () => {
    const result = fairValue([point("uniswap", 1367.64), point("luno", 1400)], now);
    expect(result).toEqual({ ok: false, reason: "cNGN is 2.37% off the naira", disagree: true });
  });

  it("checks against the median naira rate", () => {
    const result = fairValue(
      [point("uniswap", 1367.64), point("luno", 1377.8), point("textile", 1500), point("x", 1370)],
      now,
    );
    expect(result.ok).toBe(true);
  });

  it("needs the onchain price", () => {
    const result = fairValue([point("luno", 1377.8), point("textile", 1379.5)], now);
    expect(result).toEqual({ ok: false, reason: "no fresh uniswap price" });
  });

  it("needs a naira rate to check against", () => {
    const result = fairValue([point("uniswap", 1367.64, 30_000), point("uniswap", 1367.64)], now);
    expect(result).toEqual({ ok: false, reason: "no naira rate to check cNGN against" });
  });

  it("ignores stale, future-dated and broken readings", () => {
    const result = fairValue(
      [
        point("uniswap", 1367.64),
        point("luno", 1377.8, 61_000),
        point("textile", 1379.5, -60_000),
        point("x", Number.NaN),
        { source: "y", price: 0, at: now },
      ],
      now,
    );
    expect(result).toEqual({ ok: false, reason: "no naira rate to check cNGN against" });
  });
});
