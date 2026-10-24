import { lunoMid } from "./luno.ts";
import { textileMid } from "./textile.ts";
import type { PricePoint } from "./types.ts";
import { uniswapTwap } from "./uniswap.ts";

export type PriceSource = { name: string; read: () => Promise<PricePoint> };

// The pool sets the price. Textile's makers and Luno are the naira it's checked against,
// so either one can drop out without stopping the feed.
export function cngnSources(client: Parameters<typeof uniswapTwap>[0]): PriceSource[] {
  return [
    { name: "textile", read: () => textileMid() },
    { name: "uniswap", read: () => uniswapTwap(client) },
    { name: "luno", read: () => lunoMid() },
  ];
}
