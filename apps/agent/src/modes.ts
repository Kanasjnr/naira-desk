import type { RiskCheck } from "@naira-desk/intel";

export type Mode = "normal" | "caution" | "halted";
export type Trigger = "startup" | "schedule" | "price-jump" | "divergence";

export type Decision = {
  at: number;
  trigger: Trigger;
  detail?: string;
  mode: Mode;
  until?: number;
  check: RiskCheck;
};

const HOUR = 3_600_000;
const HALT_FOR = 2 * HOUR;
const RECHECK = { normal: 6 * HOUR, caution: 2 * HOUR, halted: 2 * HOUR };

// Severe news halts quoting for at least two hours; a calmer read can't lift it early.
export function decide(
  previous: Decision | undefined,
  check: RiskCheck,
  trigger: Trigger,
  now: number,
  detail?: string,
): Decision {
  const base = { at: now, trigger, ...(detail && { detail }), check };
  if (check.level === "severe") return { ...base, mode: "halted", until: now + HALT_FOR };
  if (previous?.mode === "halted" && (previous.until ?? 0) > now) {
    return { ...base, mode: "halted", until: previous.until };
  }
  return { ...base, mode: check.level === "elevated" ? "caution" : "normal" };
}

export const nextCheckAt = (decision: Decision) => decision.at + RECHECK[decision.mode];
