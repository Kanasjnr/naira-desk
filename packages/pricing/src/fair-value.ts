import type { PricePoint } from "./types.ts";

export type FairValue =
  | { ok: true; price: number; at: number; sources: string[] }
  | { ok: false; reason: string };

type Limits = { maxAgeMs: number; maxDeviationBps: number };

const defaults: Limits = { maxAgeMs: 60_000, maxDeviationBps: 25 };
const CLOCK_SKEW_MS = 5_000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function fairValue(points: PricePoint[], now: number, limits = defaults): FairValue {
  const latest = new Map<string, PricePoint>();
  for (const point of points) {
    const age = now - point.at;
    if (age < -CLOCK_SKEW_MS || age > limits.maxAgeMs) continue;
    if (!Number.isFinite(point.price) || point.price <= 0) continue;
    const seen = latest.get(point.source);
    if (!seen || point.at > seen.at) latest.set(point.source, point);
  }

  const fresh = [...latest.values()];
  if (fresh.length < 2) {
    return { ok: false, reason: `need 2 fresh sources, have ${fresh.length}` };
  }

  const center = median(fresh.map((p) => p.price));
  const agreeing = fresh.filter(
    (p) => (Math.abs(p.price - center) / center) * 10_000 <= limits.maxDeviationBps,
  );
  if (agreeing.length < 2) {
    return { ok: false, reason: `sources disagree by more than ${limits.maxDeviationBps} bps` };
  }

  return {
    ok: true,
    price: median(agreeing.map((p) => p.price)),
    at: Math.min(...agreeing.map((p) => p.at)),
    sources: agreeing.map((p) => p.source),
  };
}
