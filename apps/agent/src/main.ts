import { assertCeloMainnet, createCeloPublicClient, DEFAULT_RPC_URL } from "@naira-desk/chain";
import { cngnSources } from "@naira-desk/pricing";
import { http } from "viem";
import { createFeedServer, FEED_PATH } from "./feed.ts";
import { createPricer } from "./pricer.ts";

const rpcUrl = process.env.CELO_RPC_URL || DEFAULT_RPC_URL;
const host = process.env.FEED_HOST || "127.0.0.1";
const port = Number(process.env.FEED_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`invalid FEED_PORT: ${process.env.FEED_PORT}`);
}
const refreshMs = 5_000;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const pricer = createPricer(cngnSources(client));

// Wait for each refresh to finish before scheduling the next, so slow sources can't pile up.
let timer: NodeJS.Timeout | undefined;
let stopped = false;
async function loop() {
  await pricer.refresh();
  if (!stopped) timer = setTimeout(loop, refreshMs);
}
await loop();

const server = createFeedServer(pricer.current).listen(port, host, () => {
  console.log(`feed on http://${host}:${port}${FEED_PATH}`);
});

process.on("SIGTERM", () => {
  stopped = true;
  clearTimeout(timer);
  server.close();
});
