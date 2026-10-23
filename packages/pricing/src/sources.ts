import { lunoMid } from "./luno.ts";
import { textileMid } from "./textile.ts";
import type { PricePoint } from "./types.ts";
import { uniswapTwap } from "./uniswap.ts";

export type PriceSource = { name: string; read: () => Promise<PricePoint> };

// Three independent reads, so one that drifts or drops out is outvoted instead of
// halting the feed: the venue we trade on, the onchain pool and a naira exchange.
export function cngnSources(client: Parameters<typeof uniswapTwap>[0]): PriceSource[] {
  return [
    { name: "textile", read: () => textileMid() },
    { name: "uniswap", read: () => uniswapTwap(client) },
    { name: "luno", read: () => lunoMid() },
  ];
}
