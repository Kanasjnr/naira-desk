import { receiptsOf } from "@naira-desk/intel";
import { appendJsonl, readJsonl } from "@naira-desk/shared";
import { type Decision, decide, type Mode, nextCheckAt, type Trigger } from "./modes.ts";
import type { Assessment } from "./street.ts";

type Log = {
  all(): Decision[];
  last(): Decision | undefined;
  record(decision: Decision): Promise<void>;
};

export async function openDecisions(path: string): Promise<Log> {
  const decisions = await readJsonl<Decision>(path);
  return {
    all: () => decisions,
    last: () => decisions.at(-1),
    async record(decision) {
      decisions.push(decision);
      await appendJsonl(path, decision);
    },
  };
}

type DeskOptions = {
  check: () => Promise<Assessment>;
  log: Log;
  now?: () => number;
  cooldownMs?: number;
};

const short = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;

// Owns the quoting mode. It pays for a risk check on a schedule and when the price
// watch raises an alert, and a check that fails counts as elevated risk.
export function createRiskDesk({
  check,
  log,
  now = Date.now,
  cooldownMs = 1_800_000,
}: DeskOptions) {
  let decision = log.last();
  let running: Promise<void> | undefined;
  let lastAlertAt = Number.NEGATIVE_INFINITY;

  function review(trigger: Trigger, detail?: string) {
    running ??= (async () => {
      const result = await check().catch(
        (error): Assessment => ({
          level: "elevated",
          reason: `couldn't check: ${error instanceof Error ? error.message : error}`,
          posts: 0,
          calls: [],
        }),
      );
      const previous = decision?.mode;
      decision = decide(decision, result, trigger, now(), detail);
      await log.record(decision).catch((error) => console.error("failed to log a decision", error));
      const paid = receiptsOf(result).map(short).join(", ") || "nothing";
      const naira = (rate?: number) => (rate ? `₦${rate.toFixed(0)}` : "?");
      const { street } = result;
      const rates = street
        ? ` | onchain ${naira(street.onchain)}, official ${naira(street.official)}, parallel ${naira(street.parallel)}`
        : "";
      const change = previous && previous !== decision.mode ? `${previous} → ` : "";
      console.log(
        `${change}${decision.mode} after ${trigger}${detail ? ` (${detail})` : ""}: ${result.level}, ${result.reason}${rates} [paid ${paid}]`,
      );
    })().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    // Until the first check lands, quote carefully rather than assume all is well.
    mode: (): Mode => decision?.mode ?? "caution",
    reason: () => decision?.check.reason ?? "no risk check yet",
    current: () => decision,
    tick() {
      if (running) return running;
      if (!decision) return review("startup");
      if (now() >= nextCheckAt(decision)) return review("schedule");
    },
    alert(trigger: Trigger, detail: string) {
      if (running || now() - lastAlertAt < cooldownMs) return running;
      lastAlertAt = now();
      return review(trigger, detail);
    },
  };
}
