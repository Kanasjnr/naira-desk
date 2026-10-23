export type VaultFill = {
  at: number;
  block: number;
  logIndex: number;
  tx: string;
  side: "buy" | "sell";
  usdt: number;
  cngn: number;
  ngnPerUsdt: number | null;
  filler: string;
  sender: string;
  ours: boolean;
};

export type NavPoint = {
  at: number;
  block: number;
  tx: string;
  nav: number;
  shares: number;
  perShare: number | null;
};

// The indexer's /api/summary response.
export type VaultSummary = {
  vault: string;
  synced: { block: number | null; at: number | null };
  fills: {
    count: number;
    independent: number;
    volumeUsdt: number;
    independentVolumeUsdt: number;
    takers: number;
    lastAt: number | null;
  };
  lps: {
    depositors: number;
    independent: number;
    depositedUsdt: number;
    depositedCngn: number;
    redeemedUsdt: number;
    redeemedCngn: number;
  };
  nav: { last: NavPoint | null; shares: number };
  feeShares: number;
  paused: boolean;
};

export type Vault = { summary: VaultSummary; fills: VaultFill[]; fetchedAt: number };

const INDEXER_URL = process.env.INDEXER_URL ?? "http://127.0.0.1:8789";

async function get<T>(path: string) {
  const response = await fetch(`${INDEXER_URL}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchVault(): Promise<Vault | null> {
  try {
    const [summary, fills] = await Promise.all([
      get<VaultSummary>("/api/summary"),
      get<VaultFill[]>("/api/fills"),
    ]);
    return { summary, fills, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}
