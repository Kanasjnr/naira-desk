import type { FairValue } from "@naira-desk/pricing";
import { appendJsonl, readJsonl } from "@naira-desk/shared";

export type RateSample = { at: number; ngnPerUsdt: number };

const KEEP = 30 * 86_400_000;

// Samples the onchain naira rate every ten minutes, so the dashboard can chart it
// against the official and street rates the agent reads.
export async function openRateHistory(path: string, everyMs = 600_000) {
  const samples = await readJsonl<RateSample>(path);
  return {
    samples: () => samples,
    async observe(value: FairValue, now: number) {
      const last = samples.at(-1);
      if (!value.ok || (last && now - last.at < everyMs)) return;
      const sample = { at: now, ngnPerUsdt: Math.round((1 / value.price) * 100) / 100 };
      samples.push(sample);
      while ((samples[0]?.at ?? now) < now - KEEP) samples.shift();
      await appendJsonl(path, sample);
    },
  };
}
