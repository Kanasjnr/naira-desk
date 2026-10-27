import {
  assertCeloMainnet,
  createCeloPublicClient,
  DEFAULT_RPC_URL,
  VAULT,
  VAULT_DEPLOY_BLOCK,
} from "@naira-desk/chain";
import { briefError, dataFile } from "@naira-desk/shared";
import { http } from "viem";
import { createIndexerApi } from "./api.ts";
import { openStore } from "./store.ts";
import { createSync } from "./sync.ts";

const env = process.env;
const host = env.INDEXER_HOST || "127.0.0.1";
const port = Number(env.INDEXER_PORT || 8789);
// The safe head moves in steps of a minute or two, as batches land on Ethereum.
const pollMs = 15_000;

const client = createCeloPublicClient(http(env.CELO_RPC_URL || DEFAULT_RPC_URL));
await assertCeloMainnet(client);
const store = openStore(env.INDEXER_DB || dataFile("indexer.sqlite"));

const start = (store.cursor() ?? VAULT_DEPLOY_BLOCK - 1n) + 1n;
console.log(`indexing ${VAULT} from block ${start}`);

const sync = createSync({
  client,
  store,
  onChunk: ({ from, to, events, fills, takes }) => {
    if (events || fills)
      console.log(`blocks ${from}-${to}: ${events} vault events, ${fills} fills`);
    if (takes) console.log(`blocks ${from}-${to}: ${takes} Taker trades`);
  },
});

let syncedAt: number | null = null;
let timer: NodeJS.Timeout | undefined;
let stopped = false;
async function loop() {
  try {
    const safe = await sync.step();
    if (syncedAt === null) console.log(`caught up to safe block ${safe}`);
    syncedAt = Date.now();
  } catch (error) {
    console.error(`sync failed, will retry: ${briefError(error)}`);
  }
  if (!stopped) timer = setTimeout(loop, pollMs);
}

const api = createIndexerApi({ store, syncedAt: () => syncedAt }).listen(port, host, () => {
  console.log(`indexer api on http://${host}:${port}/api/summary`);
});
void loop();

process.on("SIGTERM", () => {
  stopped = true;
  clearTimeout(timer);
  api.close();
  store.close();
});
