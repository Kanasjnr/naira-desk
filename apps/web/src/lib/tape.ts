export type Mode = "normal" | "caution" | "halted";
export type Level = "low" | "elevated" | "severe";
export type Street = { onchain: number; official?: number; parallel?: number; offBandPct?: number };

export type Decision = {
  at: number;
  trigger: string;
  detail: string | null;
  mode: Mode;
  level: Level;
  reason: string;
  posts: number;
  street: Street | null;
  receipts: string[];
};

// The agent's /v1/tape response.
export type Tape = {
  agent: { name: string; registry: string; agentId: number; wallet: string; vault: string };
  generatedAt: number;
  current: {
    mode: Mode;
    level: Level;
    reason: string;
    checkedAt: number;
    nextCheckAt: number;
    until: number | null;
    street: Street | null;
  } | null;
  rates: { at: number; ngnPerUsdt: number }[];
  decisions: Decision[];
  research: {
    calls: number;
    usd: number;
    last24hUsd: number;
    byCapability: Record<string, { calls: number; usd: number }>;
  };
  reviews: {
    at: number;
    capability: string;
    agentId: number;
    value: number;
    calls: number;
    txHash: string;
  }[];
  sales: {
    count: number;
    usd: number;
    recent: { at: number; txHash: string; payer: string; asset: string; amount: string }[];
  };
};

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8788";

export async function fetchTape(): Promise<Tape | null> {
  try {
    const response = await fetch(`${AGENT_URL}/v1/tape`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? ((await response.json()) as Tape) : null;
  } catch {
    return null;
  }
}
