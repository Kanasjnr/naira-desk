import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openLedger } from "./ledger.ts";

const purchase = (at: number, amount: string) =>
  ({ at, path: "/x", asset: "0x", amount, outcome: "confirmed" }) as const;

describe("openLedger", () => {
  it("sums spend since a time and survives a reopen", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "ledger-")), "nested", "purchases.jsonl");
    const ledger = await openLedger(path);
    await ledger.record(purchase(1_000, "5000"));
    await ledger.record(purchase(2_000, "5000"));

    expect(ledger.spentSince(1_500)).toBe(5000n);
    expect((await openLedger(path)).spentSince(0)).toBe(10000n);
  });
});
