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
