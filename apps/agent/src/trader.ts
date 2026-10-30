import { briefError, USDT } from "@naira-desk/shared";
import { formatUnits, type Hash } from "viem";
import { bestGap, type Gap, gasInUsdt, ladderFor, MARKETS, type PoolQuoter } from "./gaps.ts";
import { InsufficientFunds, type Ladder } from "./rfq.ts";
import type { Took } from "./taker.ts";

// Gaps are sized as if the Taker held this much, so they're logged before there's money for them.
const WATCH = 100_000_000n;
// Textile's smallest firm quote.
const MIN_TAKE = 1_000_000n;
// CELO the agent keeps for its reviews rather than spending on takes.
const MIN_GAS = 10n ** 17n;
const SIGHTING_EVERY = 5 * 60_000;
// After a failed take, a market waits this long before the next try.
const MISS_PAUSE = 60_000;

// USD₮ amounts in 6-decimal units and gas in wei, as strings so they survive JSON.
export type Trade =
  | { at: number; kind: "gap"; market: string; spend: string; profit: string; gas: string }
  | {
      at: number;
      kind: "take";
      market: string;
      spent: string;
      received: string;
      gasPaid: string;
      txHash: Hash;
    }
  | { at: number; kind: "miss"; market: string; spend: string; reason: string };

// What the last scan found the Taker able to do, and why not, if it can't take.
export type TraderStatus = {
  at: number;
  float: bigint;
  celo: bigint;
  idle: "watching only" | "float under $1" | "under 0.1 CELO for gas" | null;
};

export type TraderOptions = {
  ladders: () => Promise<Ladder[]>;
  float: () => Promise<bigint>;
  gasPrice: () => Promise<bigint>;
  gasLeft: () => Promise<bigint>;
  poolPays: PoolQuoter;
  take: (gap: Gap, float: bigint, minProfit: bigint) => Promise<Took>;
  log: (trade: Trade) => Promise<void>;
  takes?: boolean;
  every?: number;
  now?: () => number;
};

const usd = (amount: bigint) => `$${formatUnits(amount, 6)}`;

export function createTrader({
  ladders,
  float,
  gasPrice,
  gasLeft,
  poolPays,
  take,
  log,
  takes = true,
  every = 15_000,
  now = Date.now,
}: TraderOptions) {
  const lastSighting = new Map<string, number>();
  const lastMiss = new Map<string, number>();
  let running: Promise<void> | undefined;
  let nextAt = 0;
  let lastWarning = "";
  let lowGas = false;
  let status: TraderStatus | null = null;

  async function sighting(gap: Gap, gas: bigint) {
    if (now() - (lastSighting.get(gap.market.name) ?? 0) < SIGHTING_EVERY) return;
    lastSighting.set(gap.market.name, now());
    const spend = String(gap.spend);
    await log({
      at: now(),
      kind: "gap",
      market: gap.market.name,
      spend,
      profit: String(gap.profit),
      gas: String(gas),
    });
  }

  async function scan() {
    const [all, held, price, celo] = await Promise.all([ladders(), float(), gasPrice(), gasLeft()]);
    const gas = gasInUsdt(all, price);
    const budget = held > WATCH ? held : WATCH;
    if (takes && celo < MIN_GAS && !lowGas)
      console.warn("the agent has under 0.1 CELO, so it only watches");
    lowGas = celo < MIN_GAS;
    const idle = !takes
      ? "watching only"
      : held < MIN_TAKE
        ? "float under $1"
        : lowGas
          ? "under 0.1 CELO for gas"
          : null;
    status = { at: now(), float: held, celo, idle };
    const canTake = idle === null;

    let best: { gap: Gap; ladder: Ladder } | undefined;
    for (const market of MARKETS) {
      const ladder = ladderFor(all, USDT, market.token);
      const smallest = ladder?.levels[0];
      if (!ladder || !smallest) continue;
      // Prices only get worse with size, so no gap at the smallest size means none at all.
      const paid = await poolPays(market, BigInt(smallest.buyAmount));
      if (paid <= BigInt(smallest.sellAmount)) continue;

      const seen = await bestGap(market, ladder, budget, poolPays);
      if (!seen || seen.profit <= gas) continue;
      await sighting(seen, gas);
      if (!canTake || now() - (lastMiss.get(market.name) ?? 0) < MISS_PAUSE) continue;
      const mine = held === budget ? seen : await bestGap(market, ladder, held, poolPays);
      if (mine && mine.profit > gas && (!best || mine.profit > best.gap.profit)) {
        best = { gap: mine, ladder };
      }
    }
    if (!best) return;

    const attempt = async (gap: Gap) => {
      const took = await take(gap, held, gas);
      await log({
        at: now(),
        kind: "take",
        market: gap.market.name,
        spent: String(took.spent),
        received: String(took.received),
        gasPaid: String(took.gasPaid),
        txHash: took.hash,
      });
      console.log(
        `took ${gap.market.name}: paid ${usd(took.spent)}, the pool paid ${usd(took.received)} [${took.hash}]`,
      );
    };
    const miss = async (gap: Gap, error: unknown) => {
      const reason = briefError(error);
      lastMiss.set(gap.market.name, now());
      await log({
        at: now(),
        kind: "miss",
        market: gap.market.name,
        spend: String(gap.spend),
        reason,
      });
      console.warn(`couldn't take ${gap.market.name}: ${reason}`);
    };

    try {
      await attempt(best.gap);
    } catch (error) {
      // Textile's view of the float can lag a take or a deposit, or hold some of it for a live
      // quote. Retry once at what it says is free, while the gap is still open.
      const free = error instanceof InsufficientFunds ? error.free : 0n;
      const smaller =
        free >= MIN_TAKE && free < best.gap.spend
          ? await bestGap(best.gap.market, best.ladder, free, poolPays)
          : undefined;
      if (!smaller || smaller.profit <= gas) return miss(best.gap, error);
      await attempt(smaller).catch((retry) => miss(smaller, retry));
    }
  }

  return {
    status: () => status,
    tick() {
      if (running || now() < nextAt) return running;
      running = scan()
        .then(() => {
          lastWarning = "";
        })
        .catch((error) => {
          const warning = briefError(error);
          if (warning !== lastWarning) console.warn(`trader: ${warning}`);
          lastWarning = warning;
        })
        .finally(() => {
          nextAt = now() + every;
          running = undefined;
        });
      return running;
    },
  };
}
