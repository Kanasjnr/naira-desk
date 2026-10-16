import { appendJsonl, readJsonl } from "@naira-desk/shared";

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
  const purchases = await readJsonl<Purchase>(path);

  return {
    async record(purchase: Purchase) {
      purchases.push(purchase);
      await appendJsonl(path, purchase);
    },
    // Rejected and ambiguous calls may still have settled, so they count too.
    spentSince(at: number) {
      return purchases.filter((p) => p.at >= at).reduce((sum, p) => sum + BigInt(p.amount), 0n);
    },
    last: () => purchases.at(-1),
  };
}
