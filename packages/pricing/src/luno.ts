import type { PricePoint } from "./types.ts";

const TICKER_URL = "https://api.luno.com/api/1/ticker?pair=USDTNGN";
const MAX_SPREAD_BPS = 50;

type Ticker = { bid?: string; ask?: string; timestamp?: number; status?: string };

// Naira per USDT on Luno, a licensed Nigerian exchange. cNGN is meant to track the naira
// one for one, so this is an off-chain read of the same rate.
export async function lunoMid(fetchFn: typeof fetch = fetch): Promise<PricePoint> {
  const response = await fetchFn(TICKER_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`luno ticker failed: ${response.status}`);
  const ticker = (await response.json()) as Ticker;
  const bid = Number(ticker.bid);
  const ask = Number(ticker.ask);
  if (ticker.status !== "ACTIVE" || !(bid > 0) || !(ask >= bid)) {
    throw new Error("luno has no USDT/NGN quote");
  }
  const mid = (bid + ask) / 2;
  // A wide book means nobody is really trading there right now.
  if (((ask - bid) / mid) * 10_000 > MAX_SPREAD_BPS) {
    throw new Error(`luno spread too wide: ${bid} / ${ask}`);
  }
  return { source: "luno", price: 1 / mid, at: ticker.timestamp ?? Date.now() };
}
