import { AGENT_ID, IDENTITY_REGISTRY, TAKER, VAULT } from "@naira-desk/chain";
import { PROVIDERS, type Purchase, receiptsOf } from "@naira-desk/intel";
import { CELO_CHAIN_ID } from "@naira-desk/shared";
import { formatEther } from "viem";
import { type Decision, nextCheckAt } from "./modes.ts";
import type { RateSample } from "./rates.ts";
import type { Review } from "./reviews.ts";
import type { Trade, TraderStatus } from "./trader.ts";

export type Sale = {
  at: number;
  txHash: string;
  payer: string;
  asset: string;
  amount: string;
};

type Sources = {
  decisions: Decision[];
  purchases: Purchase[];
  reviews: Review[];
  sales: Sale[];
  rates: RateSample[];
  trades: Trade[];
  trader: TraderStatus | null;
  wallet: string;
  now: number;
};

type Of<K extends Trade["kind"]> = Extract<Trade, { kind: K }>;

const WEEK = 7 * 86_400_000;
const usd = (atomic: bigint) => Number(atomic) / 1e6;
const sum = (items: { amount: string }[]) =>
  items.reduce((total, i) => total + BigInt(i.amount), 0n);
// Checks from before errors were shortened stored whole error dumps as the reason.
const firstLine = (reason: string) => reason.split("\n")[0] ?? reason;

// Takes are onchain, so the dashboard reads them from the indexer. Gaps the trader saw and the
// takes that failed are only known here.
function takerTape(trades: Trade[], trader: TraderStatus | null, now: number) {
  const gaps = trades.filter((t): t is Of<"gap"> => t.kind === "gap");
  const misses = trades.filter((t): t is Of<"miss"> => t.kind === "miss");
  return {
    address: TAKER,
    status: trader && {
      at: trader.at,
      floatUsd: usd(trader.float),
      gasCelo: Number(formatEther(trader.celo)),
      idle: trader.idle,
    },
    seen: {
      count: gaps.length,
      last24h: gaps.filter((g) => g.at >= now - 86_400_000).length,
      takes: trades.filter((t) => t.kind === "take").length,
      misses: misses.length,
    },
    gaps: gaps
      .filter((g) => g.at >= now - WEEK)
      .slice(-500)
      .map((g) => ({
        at: g.at,
        market: g.market,
        spendUsd: usd(BigInt(g.spend)),
        profitUsd: usd(BigInt(g.profit)),
        gasUsd: usd(BigInt(g.gas)),
      })),
    misses: misses.slice(-50).map((m) => ({
      at: m.at,
      market: m.market,
      spendUsd: usd(BigInt(m.spend)),
      reason: firstLine(m.reason),
    })),
  };
}

// Everything the dashboard shows, from the agent's own logs. Every paid call, review
// and sale carries its transaction so a reader can check it on Celoscan.
export function buildTape({
  decisions,
  purchases,
  reviews,
  sales,
  rates,
  trades,
  trader,
  wallet,
  now,
}: Sources) {
  const last = decisions.at(-1);
  const byCapability = new Map<string, { calls: number; usd: number }>();
  for (const purchase of purchases) {
    const capability =
      Object.entries(PROVIDERS).find(([, p]) => p.endpoint.endsWith(purchase.path))?.[0] ??
      purchase.path;
    const entry = byCapability.get(capability) ?? { calls: 0, usd: 0 };
    entry.calls += 1;
    entry.usd += usd(BigInt(purchase.amount));
    byCapability.set(capability, entry);
  }

  return {
    agent: {
      name: "Naira Desk",
      registry: `eip155:${CELO_CHAIN_ID}:${IDENTITY_REGISTRY}`,
      agentId: Number(AGENT_ID),
      wallet,
      vault: VAULT,
    },
    generatedAt: now,
    current: last
      ? {
          mode: last.mode,
          level: last.check.level,
          reason: firstLine(last.check.reason),
          checkedAt: last.at,
          nextCheckAt: nextCheckAt(last),
          until: last.until ?? null,
          street: last.check.street ?? null,
        }
      : null,
    rates: rates.filter((r) => r.at >= now - WEEK),
    decisions: decisions.slice(-300).map((d) => ({
      at: d.at,
      trigger: d.trigger,
      detail: d.detail ?? null,
      mode: d.mode,
      level: d.check.level,
      reason: firstLine(d.check.reason),
      posts: d.check.posts,
      street: d.check.street ?? null,
      receipts: receiptsOf(d.check),
    })),
    research: {
      calls: purchases.length,
      usd: usd(sum(purchases)),
      last24hUsd: usd(sum(purchases.filter((p) => p.at >= now - 86_400_000))),
      byCapability: Object.fromEntries(byCapability),
    },
    reviews: reviews.slice(-100),
    sales: {
      count: sales.length,
      usd: usd(sum(sales)),
      recent: sales.slice(-100),
    },
    taker: takerTape(trades, trader, now),
  };
}

export type Tape = ReturnType<typeof buildTape>;
