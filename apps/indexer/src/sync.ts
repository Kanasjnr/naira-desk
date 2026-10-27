import { setTimeout as sleep } from "node:timers/promises";
import {
  type createCeloPublicClient,
  REACTOR,
  reactorAbi,
  TAKER,
  TAKER_DEPLOY_BLOCK,
  takerAbi,
  VAULT,
  VAULT_DEPLOY_BLOCK,
  vaultEventsAbi,
} from "@naira-desk/chain";
import { getAbiItem } from "viem";
import { fillsFromLogs } from "./fills.ts";
import type { FillRow, Store, TakeRow, VaultEvent } from "./store.ts";

type Client = Pick<
  ReturnType<typeof createCeloPublicClient>,
  "getBlock" | "getLogs" | "getTransactionReceipt"
>;
type Chunk = {
  from: bigint;
  to: bigint;
  safe: bigint;
  events: number;
  fills: number;
  takes: number;
};

// forno answers at most 5000 blocks per getLogs.
const CHUNK = 5_000n;
const took = getAbiItem({ abi: takerAbi, name: "Took" });

function* chunks(from: bigint, safe: bigint) {
  for (let start = from; start <= safe; start += CHUNK) {
    yield [start, start + CHUNK - 1n < safe ? start + CHUNK - 1n : safe] as const;
  }
}

const plain = (args: object) =>
  Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]),
  );

// forno sometimes has no archive node free for older ranges, and a retry usually lands on one.
async function retry<T>(task: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt === tries) throw error;
      await sleep(attempt * 1_000);
    }
  }
}

export function createSync({
  client,
  store,
  onChunk,
}: {
  client: Client;
  store: Store;
  onChunk?: (chunk: Chunk) => void;
}) {
  // forno puts the block time on each log; other RPCs may not.
  async function timeOf(log: { blockNumber: bigint; blockTimestamp?: bigint | undefined }) {
    const seconds =
      log.blockTimestamp ?? (await client.getBlock({ blockNumber: log.blockNumber })).timestamp;
    return Number(seconds) * 1000;
  }

  async function scan(from: bigint, to: bigint) {
    const range = { fromBlock: from, toBlock: to };
    const [vaultLogs, fillLogs] = await Promise.all([
      client.getLogs({ address: VAULT, events: vaultEventsAbi, strict: true, ...range }),
      client.getLogs({
        address: REACTOR,
        event: reactorAbi[0],
        args: { swapper: VAULT },
        ...range,
      }),
    ]);

    const events: VaultEvent[] = await Promise.all(
      vaultLogs.map(async (log) => ({
        block: Number(log.blockNumber),
        logIndex: log.logIndex,
        tx: log.transactionHash,
        at: await timeOf(log),
        name: log.eventName,
        args: plain(log.args),
      })),
    );

    // A Fill log says who traded, but the amounts are in the transaction's token transfers.
    const fills: FillRow[] = [];
    for (const [hash, log] of new Map(fillLogs.map((log) => [log.transactionHash, log]))) {
      const receipt = await client.getTransactionReceipt({ hash });
      const at = await timeOf(log);
      for (const fill of fillsFromLogs(receipt.logs, VAULT)) {
        fills.push({
          ...fill,
          block: Number(receipt.blockNumber),
          tx: hash,
          at,
          sender: receipt.from,
        });
      }
    }

    store.save(to, events, fills);
    return { events: events.length, fills: fills.length };
  }

  // Took has the trade; the gas it cost is only on the receipt.
  async function scanTakes(from: bigint, to: bigint) {
    const logs = await client.getLogs({
      address: TAKER,
      event: took,
      strict: true,
      fromBlock: from,
      toBlock: to,
    });
    const takes: TakeRow[] = [];
    for (const log of logs) {
      const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
      takes.push({
        block: Number(log.blockNumber),
        logIndex: log.logIndex,
        tx: log.transactionHash,
        at: await timeOf(log),
        ...log.args,
        gasPaid: receipt.gasUsed * receipt.effectiveGasPrice,
      });
    }
    store.saveTakes(to, takes);
    return takes.length;
  }

  return {
    // Only blocks already posted to Ethereum (the safe head), so a reorg can't undo a row.
    async step() {
      const safe = (await client.getBlock({ blockTag: "safe" })).number;
      for (const [from, to] of chunks((store.cursor() ?? VAULT_DEPLOY_BLOCK - 1n) + 1n, safe)) {
        const found = await retry(() => scan(from, to));
        onChunk?.({ from, to, safe, ...found, takes: 0 });
      }
      for (const [from, to] of chunks(
        (store.takerCursor() ?? TAKER_DEPLOY_BLOCK - 1n) + 1n,
        safe,
      )) {
        const takes = await retry(() => scanTakes(from, to));
        onChunk?.({ from, to, safe, events: 0, fills: 0, takes });
      }
      return safe;
    },
  };
}
