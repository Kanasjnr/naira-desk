import { createCeloPublicClient } from "@naira-desk/chain";
import { custom, type Hex, isAddressEqual, toHex } from "viem";
import { describe, expect, it } from "vitest";
import deposit from "./fixtures/first-deposit.json" with { type: "json" };
import fill from "./fixtures/first-fill.json" with { type: "json" };
import take from "./fixtures/first-take.json" with { type: "json" };
import { openStore } from "./store.ts";
import { summarize, takerSummary } from "./summary.ts";
import { createSync } from "./sync.ts";

type RawLog = { address: Hex; blockNumber: Hex; topics: Hex[] };
type Filter = { address: Hex; fromBlock: Hex; toBlock: Hex; topics: (Hex | Hex[] | null)[] };
type Receipt = { transactionHash: string; logs: unknown[] };

const SAFE = 80_330_000n;

const matches = (log: RawLog, { address, fromBlock, toBlock, topics }: Filter) =>
  isAddressEqual(log.address, address) &&
  BigInt(log.blockNumber) >= BigInt(fromBlock) &&
  BigInt(log.blockNumber) <= BigInt(toBlock) &&
  topics.every((want, i) => {
    const topic = log.topics[i] as Hex;
    return want === null || (Array.isArray(want) ? want.includes(topic) : want === topic);
  });

// Serves these logs and receipts as mainnet returned them, with the safe head at `safe`.
const serve = (logs: unknown[], receipts: Receipt[], safe: bigint) =>
  custom({
    async request({ method, params }) {
      if (method === "eth_getBlockByNumber") return { number: toHex(safe), timestamp: "0x0" };
      if (method === "eth_getLogs") return (logs as RawLog[]).filter((l) => matches(l, params[0]));
      const receipt = receipts.find((r) => r.transactionHash === params[0]);
      if (method === "eth_getTransactionReceipt" && receipt) return receipt;
      throw new Error(`unexpected ${method}`);
    },
  });

// The vault's first deposit and first fill.
const chain = serve([...deposit, ...fill.logs], [fill as Receipt], SAFE);

describe("createSync", () => {
  it("indexes the vault from deploy to the safe head", async () => {
    const store = openStore(":memory:");
    const sync = createSync({ client: createCeloPublicClient(chain), store });

    expect(await sync.step()).toBe(SAFE);
    await sync.step();

    expect(store.cursor()).toBe(SAFE);
    expect(store.events().map((event) => event.name)).toEqual([
      "StrategySignerRotated",
      "DepositRequest",
      "EpochClosed",
      "MarkUpdated",
      "Transfer",
      "MarkUpdated",
      "NavSettled",
      "DepositEpochProcessed",
    ]);
    expect(store.fills()).toMatchObject([
      { tx: fill.transactionHash, side: "buy", usdt: 1_469_401n, cngn: 1_999_800_020n },
    ]);
  });

  it("keeps our own trades and deposits out of the independent numbers", async () => {
    const store = openStore(":memory:");
    await createSync({ client: createCeloPublicClient(chain), store }).step();

    expect(summarize(store.events(), store.fills())).toEqual({
      fills: {
        count: 1,
        independent: 0,
        volumeUsdt: 1.469401,
        independentVolumeUsdt: 0,
        takers: 0,
        lastAt: expect.any(Number),
      },
      lps: {
        depositors: 1,
        independent: 0,
        depositedUsdt: 5,
        depositedCngn: 0,
        redeemedUsdt: 0,
        redeemedCngn: 0,
      },
      nav: {
        last: expect.objectContaining({ nav: 5, shares: 5, perShare: 1 }),
        shares: 5,
      },
      feeShares: 0,
      paused: false,
    });
  });

  // The Taker's first trade: $1.73 of wARS from Textile, sold to Uniswap for $1.76.
  it("indexes the Taker's trades from its deploy block, with the gas each cost", async () => {
    const store = openStore(":memory:");
    const head = BigInt(take.blockNumber);
    await createSync({
      client: createCeloPublicClient(serve(take.logs, [take], head)),
      store,
    }).step();

    expect(store.takerCursor()).toBe(head);
    expect(store.takes()).toEqual([
      {
        block: Number(head),
        logIndex: 12,
        tx: take.transactionHash,
        at: 1_793_024_723_000,
        token: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
        amount: 2_880_603_086_793_346_238_043n,
        spent: 1_727_903n,
        received: 1_759_871n,
        gasPaid: 55_929_285_000_000_000n,
      },
    ]);
    expect(takerSummary(store.takes())).toMatchObject({
      count: 1,
      volumeUsdt: 1.727903,
      profitUsdt: 0.031968,
      gasCelo: 0.055929285,
      markets: { wARS: { count: 1 }, cNGN: { count: 0 }, wBRL: { count: 0 } },
    });
  });
});
