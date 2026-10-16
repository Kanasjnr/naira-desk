import type { FairValue } from "@naira-desk/pricing";
import type { Trigger } from "./modes.ts";

type Options = { windowMs?: number; thresholdBps?: number; disagreeMs?: number };
export type Alert = { trigger: Extract<Trigger, "price-jump" | "divergence">; detail: string };

// Flags a sharp move in the fair value, or sources that keep disagreeing, so the
// agent can pay to find out why before it keeps quoting.
export function createPriceWatch({
  windowMs = 600_000,
  thresholdBps = 50,
  disagreeMs = 120_000,
}: Options = {}) {
  const history: { at: number; price: number }[] = [];
  let disagreeSince: number | undefined;

  return function observe(value: FairValue, now: number): Alert | undefined {
    if (!value.ok) {
      if (!value.disagree) {
        disagreeSince = undefined;
        return;
      }
      disagreeSince ??= now;
      if (now - disagreeSince < disagreeMs) return;
      return { trigger: "divergence", detail: value.reason };
    }

    disagreeSince = undefined;
    history.push({ at: now, price: value.price });
    while ((history[0]?.at ?? now) < now - windowMs) history.shift();
    const oldest = history[0];
    if (!oldest) return;
    const moveBps = ((value.price - oldest.price) / oldest.price) * 10_000;
    if (Math.abs(moveBps) < thresholdBps) return;
    const minutes = Math.max(1, Math.round((now - oldest.at) / 60_000));
    return {
      trigger: "price-jump",
      detail: `${moveBps > 0 ? "+" : ""}${moveBps.toFixed(0)} bps in ${minutes} min`,
    };
  };
}
