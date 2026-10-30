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
  agent: {
    name: string;
    registry: string;
    agentId: number;
    wallet: string;
    vault: string;
    // Missing from an agent that predates the count.
    taggedTxs?: number | null;
  };
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
  // `naira` is the off-chain rate cNGN was checked against.
  rates: { at: number; ngnPerUsdt: number; naira?: number }[];
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
    // Missing from an agent that predates the demo buyer.
    independent?: number;
    independentUsd?: number;
    recent: {
      at: number;
      txHash: string;
      payer: string;
      asset: string;
      amount: string;
      ours?: boolean;
    }[];
  };
  // Missing from an agent that predates the trader.
  taker?: TakerTape;
};

export type Gap = {
  at: number;
  market: string;
  spendUsd: number;
  profitUsd: number;
  gasUsd: number;
};

export type TakerTape = {
  address: string;
  status: {
    at: number;
    floatUsd: number;
    gasCelo: number;
    idle: "watching only" | "float under $1" | "under 0.1 CELO for gas" | null;
  } | null;
  seen: { count: number; last24h: number; takes: number; misses: number };
  gaps: Gap[];
  misses: { at: number; market: string; spendUsd: number; reason: string }[];
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
