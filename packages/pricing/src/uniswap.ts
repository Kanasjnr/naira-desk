import type { createCeloPublicClient } from "@naira-desk/chain";
import { parseAbi } from "viem";
import type { PricePoint } from "./types.ts";

const CNGN_USDT_POOL = "0x6519d56Eb0A69FC0338657784c783B169b8f7d32";

const poolAbi = parseAbi([
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",
]);

type Client = Pick<ReturnType<typeof createCeloPublicClient>, "getBlock" | "readContract">;

// Time-weighted price from the Uniswap v3 cNGN/USDT pool. USDT is token0 and
// cNGN token1, both with 6 decimals, so 1.0001^-tick is USDT per cNGN.
// Two minutes tracks the market without letting a single block move the price.
export async function uniswapTwap(client: Client, seconds = 120): Promise<PricePoint> {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`invalid TWAP window: ${seconds}`);
  }
  const block = await client.getBlock();
  const [ticks] = await client.readContract({
    address: CNGN_USDT_POOL,
    abi: poolAbi,
    functionName: "observe",
    args: [[seconds, 0]],
    blockNumber: block.number,
  });
  const [then, now] = ticks;
  if (then === undefined || now === undefined) throw new Error("pool returned no observations");
  const averageTick = Number(now - then) / seconds;
  return { source: "uniswap", price: 1.0001 ** -averageTick, at: Number(block.timestamp) * 1000 };
}
