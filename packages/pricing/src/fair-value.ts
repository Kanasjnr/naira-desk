import type { PricePoint } from "./types.ts";

export type FairValue =
  // `naira` is the off-chain rate cNGN was checked against, in the same units as `price`.
  | { ok: true; price: number; at: number; sources: string[]; naira: number }
  | { ok: false; reason: string; disagree?: true };

type Limits = { anchor: string; maxAgeMs: number; maxPegGapBps: number };

const defaults: Limits = { anchor: "uniswap", maxAgeMs: 60_000, maxPegGapBps: 150 };
const CLOCK_SKEW_MS = 5_000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// The vault trades onchain cNGN, so it prices where cNGN trades onchain: quoting off that
// market is the only way nobody can buy from the vault and sell to the pool at a profit.
// Naira rates from off-chain markets don't set the price, they check cNGN still tracks the
// naira. Past the gap limit the pool is broken or the peg is, and the vault stops quoting.
export function fairValue(points: PricePoint[], now: number, limits = defaults): FairValue {
  const latest = new Map<string, PricePoint>();
  for (const point of points) {
    const age = now - point.at;
    if (age < -CLOCK_SKEW_MS || age > limits.maxAgeMs) continue;
    if (!Number.isFinite(point.price) || point.price <= 0) continue;
    const seen = latest.get(point.source);
    if (!seen || point.at > seen.at) latest.set(point.source, point);
  }

  const anchor = latest.get(limits.anchor);
  if (!anchor) return { ok: false, reason: `no fresh ${limits.anchor} price` };
  const references = [...latest.values()].filter((point) => point !== anchor);
  if (references.length === 0) return { ok: false, reason: "no naira rate to check cNGN against" };

  const naira = median(references.map((point) => point.price));
  const gapBps = ((anchor.price - naira) / naira) * 10_000;
  if (Math.abs(gapBps) > limits.maxPegGapBps) {
    return {
      ok: false,
      reason: `cNGN is ${(gapBps / 100).toFixed(2)}% off the naira`,
      disagree: true,
    };
  }

  return {
    ok: true,
    price: anchor.price,
    at: Math.min(anchor.at, ...references.map((point) => point.at)),
    sources: [anchor.source, ...references.map((point) => point.source)],
    naira,
  };
}
