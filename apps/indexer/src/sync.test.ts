import { createCeloPublicClient } from "@naira-desk/chain";
import { custom, type Hex, isAddressEqual, toHex } from "viem";
import { describe, expect, it } from "vitest";
import deposit from "./fixtures/first-deposit.json" with { type: "json" };
import fill from "./fixtures/first-fill.json" with { type: "json" };
import { openStore } from "./store.ts";
import { summarize } from "./summary.ts";
import { createSync } from "./sync.ts";

type RawLog = { address: Hex; blockNumber: Hex; topics: Hex[] };
type Filter = { address: Hex; fromBlock: Hex; toBlock: Hex; topics: (Hex | Hex[] | null)[] };

const SAFE = 80_330_000n;
const logs: RawLog[] = [...deposit, ...fill.logs] as RawLog[];

const matches = (log: RawLog, { address, fromBlock, toBlock, topics }: Filter) =>
  isAddressEqual(log.address, address) &&
  BigInt(log.blockNumber) >= BigInt(fromBlock) &&
  BigInt(log.blockNumber) <= BigInt(toBlock) &&
  topics.every((want, i) => {
    const topic = log.topics[i] as Hex;
    return want === null || (Array.isArray(want) ? want.includes(topic) : want === topic);
  });

// Serves the vault's first deposit and first fill, as mainnet returned them.
const chain = custom({
  async request({ method, params }) {
    if (method === "eth_getBlockByNumber") return { number: toHex(SAFE), timestamp: "0x0" };
    if (method === "eth_getLogs") return logs.filter((log) => matches(log, params[0]));
    if (method === "eth_getTransactionReceipt" && params[0] === fill.transactionHash) return fill;
    throw new Error(`unexpected ${method}`);
  },
});

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
});
