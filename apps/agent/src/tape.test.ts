import type { Purchase } from "@naira-desk/intel";
import { describe, expect, it } from "vitest";
import type { Decision } from "./modes.ts";
import { buildTape } from "./tape.ts";

const HOUR = 3_600_000;
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const purchase = (at: number, path: string, amount: string): Purchase => ({
  at,
  path,
  asset: USDT,
  amount,
  txHash: "0x1",
  outcome: "confirmed",
});

const decisions: Decision[] = [
  {
    at: HOUR,
    trigger: "startup",
    mode: "normal",
    // Logged before calls were recorded.
    check: { level: "low", reason: "routine", posts: 10, receipts: ["0xold"] } as never,
  },
  {
    at: 3 * HOUR,
    trigger: "price-jump",
    detail: "+64 bps in 9 min",
    mode: "halted",
    until: 5 * HOUR,
    check: {
      level: "severe",
      reason: "new CBN directive",
      posts: 17,
      calls: [{ capability: "x.posts.search", txHash: "0xnew", ok: true, posts: 10 }],
      street: { onchain: 1373, official: 1340, parallel: 1412, offBandPct: 0 },
    },
  },
];

describe("buildTape", () => {
  const tape = buildTape({
    decisions,
    purchases: [
      purchase(HOUR, "/v1/social/x/posts/search", "5000"),
      purchase(HOUR, "/cencori/v1/chat/completions", "10000"),
      purchase(26 * HOUR, "/v1/social/x/posts/search", "5000"),
    ],
    reviews: [],
    sales: [{ at: 4 * HOUR, txHash: "0xsale", payer: "0xbuyer", asset: USDT, amount: "5000" }],
    rates: [
      { at: 0, ngnPerUsdt: 1361 },
      { at: 28 * HOUR, ngnPerUsdt: 1365 },
    ],
    trades: [
      { at: HOUR, kind: "gap", market: "wARS", spend: "29433115", profit: "565000", gas: "6682" },
      {
        at: 27 * HOUR,
        kind: "gap",
        market: "cNGN",
        spend: "14741497",
        profit: "44013",
        gas: "6682",
      },
      {
        at: 27 * HOUR,
        kind: "take",
        market: "cNGN",
        spent: "1800000",
        received: "1805659",
        gasPaid: "55929285000000000",
        txHash: "0xtake",
      },
      {
        at: 28 * HOUR,
        kind: "miss",
        market: "wARS",
        spend: "1936830",
        reason: "textile /rfq/request: insufficient_funds\nmore detail",
      },
    ],
    trader: { at: 28 * HOUR, float: 1_830_000n, celo: 68n * 10n ** 16n, idle: null },
    wallet: "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582",
    now: 28 * HOUR,
  });

  it("leads with the latest decision and when the halt lifts", () => {
    expect(tape.current).toMatchObject({
      mode: "halted",
      reason: "new CBN directive",
      until: 5 * HOUR,
      nextCheckAt: 5 * HOUR,
      street: { parallel: 1412 },
    });
  });

  it("shows only the first line of an old error dump", () => {
    const old = buildTape({
      decisions: [
        {
          at: HOUR,
          trigger: "schedule",
          mode: "caution",
          check: {
            level: "elevated",
            reason: "couldn't check: HTTP request failed.\n\nURL: https://forno.celo.org/",
            posts: 0,
            calls: [],
          },
        },
      ],
      purchases: [],
      reviews: [],
      sales: [],
      rates: [],
      trades: [],
      trader: null,
      wallet: "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582",
      now: HOUR,
    });
    expect(old.decisions[0]?.reason).toBe("couldn't check: HTTP request failed.");
    expect(old.current?.reason).toBe("couldn't check: HTTP request failed.");
    expect(old.taker).toMatchObject({ status: null, gaps: [], misses: [], seen: { count: 0 } });
  });

  it("shows the gaps the trader saw, its misses and what it can trade with", () => {
    expect(tape.taker).toEqual({
      address: "0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57",
      status: { at: 28 * HOUR, floatUsd: 1.83, gasCelo: 0.68, idle: null },
      seen: { count: 2, last24h: 1, takes: 1, misses: 1 },
      gaps: [
        { at: HOUR, market: "wARS", spendUsd: 29.433115, profitUsd: 0.565, gasUsd: 0.006682 },
        {
          at: 27 * HOUR,
          market: "cNGN",
          spendUsd: 14.741497,
          profitUsd: 0.044013,
          gasUsd: 0.006682,
        },
      ],
      misses: [
        {
          at: 28 * HOUR,
          market: "wARS",
          spendUsd: 1.93683,
          reason: "textile /rfq/request: insufficient_funds",
        },
      ],
    });
  });

  it("keeps every decision's receipts, including ones logged the old way", () => {
    expect(tape.decisions.map((d) => d.receipts)).toEqual([["0xold"], ["0xnew"]]);
    expect(tape.decisions[1]).toMatchObject({ trigger: "price-jump", detail: "+64 bps in 9 min" });
  });

  it("totals research spend by provider and sales revenue", () => {
    expect(tape.research).toEqual({
      calls: 3,
      usd: 0.02,
      last24hUsd: 0.005,
      byCapability: {
        "x.posts.search": { calls: 2, usd: 0.01 },
        "cencori.v1.chat.completions": { calls: 1, usd: 0.01 },
      },
    });
    expect(tape.sales).toMatchObject({ count: 1, usd: 0.005 });
    expect(tape.agent).toMatchObject({
      agentId: 9908,
      vault: "0xD7137d85607BE18628CE00B1020895cEBceEAD6C",
    });
  });
});
