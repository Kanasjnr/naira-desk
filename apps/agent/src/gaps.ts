import { CNGN, USDT, WARS, WBRL } from "@naira-desk/shared";
import { type Address, isAddressEqual } from "viem";
import type { Ladder } from "./rfq.ts";

export type Market = { name: string; token: Address; fee: number };

// Textile pairs with a Uniswap pool against USD₮ deep enough to sell into.
export const MARKETS: Market[] = [
  { name: "cNGN", token: CNGN, fee: 100 },
  { name: "wBRL", token: WBRL, fee: 100 },
  { name: "wARS", token: WARS, fee: 100 },
];

const CELO = "0x471EcE3750Da237f93B8E339c536989b8978a438";

// Gas a take used in the mainnet-fork replays, with room to spare.
export const TAKE_GAS = 350_000n;

// USD₮ amounts are in its 6-decimal units throughout.
export type Gap = {
  market: Market;
  spend: bigint;
  bought: bigint;
  poolPays: bigint;
  profit: bigint;
};

export type PoolQuoter = (market: Market, amount: bigint) => Promise<bigint>;

export function ladderFor(ladders: Ladder[], sell: Address, buy: Address) {
  return ladders.find(
    (ladder) => isAddressEqual(ladder.sellToken, sell) && isAddressEqual(ladder.buyToken, buy),
  );
}

// What the maker gives for `spend`, read between the ladder's published points.
export function ladderBuys(ladder: Ladder, spend: bigint) {
  let sold = 0n;
  let bought = 0n;
  for (const level of ladder.levels) {
    const sell = BigInt(level.sellAmount);
    const buy = BigInt(level.buyAmount);
    if (spend <= sell) return bought + ((buy - bought) * (spend - sold)) / (sell - sold);
    sold = sell;
    bought = buy;
  }
  return undefined;
}

// Tries every ladder point the budget covers, and the budget itself, and keeps the size where
// the pool pays back the most over what the maker is paid.
export async function bestGap(
  market: Market,
  ladder: Ladder,
  budget: bigint,
  poolPays: PoolQuoter,
): Promise<Gap | undefined> {
  const top = budget < BigInt(ladder.maxSellAmount) ? budget : BigInt(ladder.maxSellAmount);
  const sizes = new Set(
    ladder.levels.map((level) => BigInt(level.sellAmount)).filter((sell) => sell <= top),
  );
  if (top > 0n) sizes.add(top);

  let best: Gap | undefined;
  for (const spend of sizes) {
    const bought = ladderBuys(ladder, spend);
    if (!bought) continue;
    const pays = await poolPays(market, bought);
    if (!best || pays - spend > best.profit) {
      best = { market, spend, bought, poolPays: pays, profit: pays - spend };
    }
  }
  return best;
}

// A take's gas in USD₮, priced at what Textile's makers pay for CELO.
export function gasInUsdt(ladders: Ladder[], gasPrice: bigint) {
  const celo = ladderFor(ladders, CELO, USDT)?.levels[0];
  if (!celo) throw new Error("textile has no CELO price");
  return (TAKE_GAS * gasPrice * BigInt(celo.buyAmount)) / BigInt(celo.sellAmount);
}
