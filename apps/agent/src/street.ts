import type { RiskCheck } from "@naira-desk/intel";
import type { FairValue } from "@naira-desk/pricing";

// Naira per USDT onchain, next to the official and parallel rates quoted in the posts.
export type Street = { onchain: number; official?: number; parallel?: number; offBandPct?: number };
export type Assessment = RiskCheck & { street?: Street };

const MAX_OFF_BAND_PCT = 3;

// cNGN normally trades between the official and parallel rates. Well outside that band,
// someone is about to arbitrage the vault, so a calm read becomes a careful one.
export function againstStreet(check: RiskCheck, value: FairValue): Assessment {
  if (!value.ok) return check;
  const onchain = 1 / value.price;
  // A rate this far from ours is a misread, not a market.
  const plausible = (rate?: number) =>
    rate && rate > onchain * 0.7 && rate < onchain * 1.4 ? rate : undefined;
  const official = plausible(check.rates?.official);
  const parallel = plausible(check.rates?.parallel);
  if (!parallel) return { ...check, street: { onchain, official } };

  const low = Math.min(official ?? parallel, parallel);
  const high = Math.max(official ?? parallel, parallel);
  const off = onchain < low ? low - onchain : onchain > high ? onchain - high : 0;
  const offBandPct = (off / (onchain < low ? low : high)) * 100;
  const street = { onchain, official, parallel, offBandPct };
  if (offBandPct <= MAX_OFF_BAND_PCT || check.level !== "low") return { ...check, street };

  const band = official ? `₦${low.toFixed(0)}–₦${high.toFixed(0)}` : `₦${parallel.toFixed(0)}`;
  return {
    ...check,
    level: "elevated",
    reason: `onchain ₦${onchain.toFixed(0)} is ${offBandPct.toFixed(1)}% off the street rate ${band}; ${check.reason}`,
    street,
  };
}
