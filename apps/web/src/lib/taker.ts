export type Take = {
  at: number;
  block: number;
  logIndex: number;
  tx: string;
  market: string;
  amount: number | null;
  spent: number;
  received: number;
  profit: number;
  gasCelo: number;
};

type Totals = { count: number; volumeUsdt: number; profitUsdt: number; gasCelo: number };

// The indexer's /api/taker response.
export type Taker = Totals & {
  taker: string;
  synced: { block: number | null; at: number | null };
  lastAt: number | null;
  markets: Record<string, Totals>;
  takes: Take[];
  fetchedAt: number;
};

const INDEXER_URL = process.env.INDEXER_URL ?? "http://127.0.0.1:8789";

export async function fetchTaker(): Promise<Taker | null> {
  try {
    const response = await fetch(`${INDEXER_URL}/api/taker`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return { ...((await response.json()) as Omit<Taker, "fetchedAt">), fetchedAt: Date.now() };
  } catch {
    return null;
  }
}
