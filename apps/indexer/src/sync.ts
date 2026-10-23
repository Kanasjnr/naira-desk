import { setTimeout as sleep } from "node:timers/promises";
import {
  type createCeloPublicClient,
  REACTOR,
  reactorAbi,
  VAULT,
  VAULT_DEPLOY_BLOCK,
  vaultEventsAbi,
} from "@naira-desk/chain";
import { fillsFromLogs } from "./fills.ts";
import type { FillRow, Store, VaultEvent } from "./store.ts";

type Client = Pick<
  ReturnType<typeof createCeloPublicClient>,
  "getBlock" | "getLogs" | "getTransactionReceipt"
>;
type Chunk = { from: bigint; to: bigint; safe: bigint; events: number; fills: number };

// forno answers at most 5000 blocks per getLogs.
const CHUNK = 5_000n;

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

  return {
    // Only blocks already posted to Ethereum (the safe head), so a reorg can't undo a row.
    async step() {
      const safe = (await client.getBlock({ blockTag: "safe" })).number;
      let from = (store.cursor() ?? VAULT_DEPLOY_BLOCK - 1n) + 1n;
      while (from <= safe) {
        const to = from + CHUNK - 1n < safe ? from + CHUNK - 1n : safe;
        const found = await retry(() => scan(from, to));
        onChunk?.({ from, to, safe, ...found });
        from = to + 1n;
      }
      return safe;
    },
  };
}
