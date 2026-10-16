import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type Purchase = {
  at: number;
  path: string;
  asset: string;
  amount: string;
  txHash?: string;
  outcome: "confirmed" | "rejected" | "ambiguous";
};

export type Ledger = Awaited<ReturnType<typeof openLedger>>;

// One JSON line per paid call, so spend survives restarts and the receipts can be published.
export async function openLedger(path: string) {
  const purchases: Purchase[] = await readFile(path, "utf8").then(
    (text) =>
      text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  return {
    async record(purchase: Purchase) {
      purchases.push(purchase);
      await appendFile(path, `${JSON.stringify(purchase)}\n`, { mode: 0o600 });
    },
    // Rejected and ambiguous calls may still have settled, so they count too.
    spentSince(at: number) {
      return purchases.filter((p) => p.at >= at).reduce((sum, p) => sum + BigInt(p.amount), 0n);
    },
    last: () => purchases.at(-1),
  };
}
