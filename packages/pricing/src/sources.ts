import { textileMid } from "./textile.ts";
import type { PricePoint } from "./types.ts";
import { uniswapTwap } from "./uniswap.ts";

export type PriceSource = { name: string; read: () => Promise<PricePoint> };

export function cngnSources(client: Parameters<typeof uniswapTwap>[0]): PriceSource[] {
  return [
    { name: "textile", read: () => textileMid() },
    { name: "uniswap", read: () => uniswapTwap(client) },
  ];
}
