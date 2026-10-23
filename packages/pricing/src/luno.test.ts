import { describe, expect, it } from "vitest";
import { lunoMid } from "./luno.ts";

// Real ticker responses from Luno.
const usdt = {
  pair: "USDTNGN",
  timestamp: 1792768429974,
  bid: "1376.2141",
  ask: "1376.2142",
  last_trade: "1376.2141",
  rolling_24_hour_volume: "165886.88",
  status: "ACTIVE",
};
const usdc = { ...usdt, pair: "USDCNGN", bid: "1320.00", ask: "1569.00" };

const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("lunoMid", () => {
  it("prices cNGN off the USDT/NGN mid", async () => {
    const point = await lunoMid(fakeFetch(usdt));
    expect(point).toMatchObject({ source: "luno", at: 1792768429974 });
    expect(1 / point.price).toBeCloseTo(1376.21415, 4);
  });

  it("refuses a book too wide to mean anything", async () => {
    await expect(lunoMid(fakeFetch(usdc))).rejects.toThrow(/spread too wide/);
  });

  it("refuses a market that isn't trading", async () => {
    await expect(lunoMid(fakeFetch({ ...usdt, status: "POSTONLY" }))).rejects.toThrow(/no USDT/);
  });

  it("throws on an HTTP error", async () => {
    await expect(lunoMid(fakeFetch({}, 503))).rejects.toThrow(/503/);
  });
});
