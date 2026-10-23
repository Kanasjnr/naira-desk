import { VAULT } from "@naira-desk/chain";
import { formatTransactionReceipt } from "viem";
import { describe, expect, it } from "vitest";
import { fillsFromLogs } from "./fills.ts";
import batch from "./fixtures/batch-fill.json" with { type: "json" };
import first from "./fixtures/first-fill.json" with { type: "json" };

const logsOf = (receipt: object) => formatTransactionReceipt(receipt as never).logs;

describe("fillsFromLogs", () => {
  // The vault's first fill: the operator's wallet sold it naira as a test.
  it("reads the vault's first fill", () => {
    expect(fillsFromLogs(logsOf(first), VAULT)).toEqual([
      {
        orderHash: "0xe0f6b4ce4f204901b700f4fd7d8b33093d6b1c3763e13510d5469b869bb07c48",
        logIndex: 407,
        filler: "0xa1599790B763E537bd15b5b912012e5Fb65491a3",
        side: "buy",
        usdt: 1_469_401n,
        cngn: 1_999_800_020n,
      },
    ]);
  });

  // One taker order split across two makers, both selling naira, in a single transaction.
  it("splits a batch between makers", () => {
    const logs = logsOf(batch);
    const first = fillsFromLogs(logs, "0x25a5c1ae633eb3e1988cfdeed07cdbd2e998ab52");
    const second = fillsFromLogs(logs, "0xf0d95682c1d70f8e8821451df191293ed2908639");
    expect(first).toMatchObject([{ side: "sell", usdt: 912_276n, cngn: 1_239_832_238n }]);
    expect(second).toMatchObject([{ side: "sell", usdt: 87_625n, cngn: 119_218_498n }]);
  });

  it("finds nothing for a vault that didn't trade", () => {
    expect(fillsFromLogs(logsOf(batch), VAULT)).toEqual([]);
  });
});
