import { AGENT_ID, IDENTITY_REGISTRY, VAULT } from "@naira-desk/chain";
import { PROVIDERS, type Purchase, receiptsOf } from "@naira-desk/intel";
import { CELO_CHAIN_ID } from "@naira-desk/shared";
import { type Decision, nextCheckAt } from "./modes.ts";
import type { RateSample } from "./rates.ts";
import type { Review } from "./reviews.ts";

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
  wallet: string;
  now: number;
};

const WEEK = 7 * 86_400_000;
const usd = (atomic: bigint) => Number(atomic) / 1e6;
const sum = (items: { amount: string }[]) =>
  items.reduce((total, i) => total + BigInt(i.amount), 0n);

// Everything the proof page shows, from the agent's own logs. Every paid call, review
// and sale carries its transaction so a reader can check it on Celoscan.
export function buildTape({
  decisions,
  purchases,
  reviews,
  sales,
  rates,
  wallet,
  now,
}: Sources) {
  const last = decisions.at(-1);
  const byCapability = new Map<string, { calls: number; usd: number }>();
  for (const purchase of purchases) {
    const capability =
      Object.entries(PROVIDERS).find(([, p]) =>
        p.endpoint.endsWith(purchase.path),
      )?.[0] ?? purchase.path;
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
          reason: last.check.reason,
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
      reason: d.check.reason,
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
  };
}

export type Tape = ReturnType<typeof buildTape>;
