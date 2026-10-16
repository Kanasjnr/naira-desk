import { AGENT_ID, IDENTITY_REGISTRY, VAULT } from "@naira-desk/chain";
import { receiptsOf } from "@naira-desk/intel";
import type { FairValue } from "@naira-desk/pricing";
import { CELO_CHAIN_ID } from "@naira-desk/shared";
import type { Decision } from "./modes.ts";

const iso = (at: number) => new Date(at).toISOString();
const naira = (rate?: number) => (rate === undefined ? null : Math.round(rate * 100) / 100);

// What a paid call to /v1/naira returns: the onchain rate, the street rates read from
// the posts the agent paid for, and its current risk call, each with its evidence.
export function nairaQuote(value: FairValue, decision: Decision | undefined) {
  if (!value.ok) return undefined;
  const street = decision?.check.street;
  return {
    pair: "NGN/USD",
    onchain: { ngnPerUsdt: naira(1 / value.price), sources: value.sources, at: iso(value.at) },
    street:
      decision && (street?.official || street?.parallel)
        ? {
            official: naira(street.official),
            parallel: naira(street.parallel),
            onchainOffBandPct: naira(street.offBandPct),
            at: iso(decision.at),
          }
        : null,
    risk: decision
      ? {
          mode: decision.mode,
          level: decision.check.level,
          reason: decision.check.reason,
          checkedAt: iso(decision.at),
          evidence: receiptsOf(decision.check),
        }
      : null,
    agent: {
      registry: `eip155:${CELO_CHAIN_ID}:${IDENTITY_REGISTRY}`,
      agentId: Number(AGENT_ID),
      vault: `eip155:${CELO_CHAIN_ID}:${VAULT}`,
    },
  };
}

export type NairaQuote = NonNullable<ReturnType<typeof nairaQuote>>;
