import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  DEFAULT_RPC_URL,
  readKeyFile,
  tokenBalance,
} from "@naira-desk/chain";
import { checkNairaRisk, createBuyer, openLedger } from "@naira-desk/intel";
import { cngnSources, type FairValue } from "@naira-desk/pricing";
import { dataFile } from "@naira-desk/shared";
import { http } from "viem";
import { createRiskDesk, openDecisions } from "./desk.ts";
import { createFeedServer, FEED_PATH } from "./feed.ts";
import { createPricer } from "./pricer.ts";
import { createPriceWatch } from "./watch.ts";

const env = process.env;
const rpcUrl = env.CELO_RPC_URL || DEFAULT_RPC_URL;
const host = env.FEED_HOST || "127.0.0.1";
const port = Number(env.FEED_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`invalid FEED_PORT: ${env.FEED_PORT}`);
}
const refreshMs = 5_000;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const pricer = createPricer(cngnSources(client));

const { account } = createTaggedWalletClient(
  await readKeyFile(env.AGENT_KEY_FILE || dataFile("agent.key")),
  http(rpcUrl),
);
const buyer = createBuyer({
  account,
  ledger: await openLedger(env.BUY_LEDGER_FILE || dataFile("purchases.jsonl")),
  readBalance: tokenBalance(client),
});
const desk = createRiskDesk({
  check: () => checkNairaRisk(buyer),
  log: await openDecisions(env.DECISIONS_FILE || dataFile("decisions.jsonl")),
});
const watch = createPriceWatch();

const restored = desk.current();
if (restored) console.log(`restored ${restored.mode} from ${new Date(restored.at).toISOString()}`);

// Wait for each refresh to finish before scheduling the next, so slow sources can't pile up.
// Risk checks run alongside and never hold up the feed.
let timer: NodeJS.Timeout | undefined;
let stopped = false;
async function loop() {
  await pricer.refresh();
  const alert = watch(pricer.current(), Date.now());
  void (alert ? desk.alert(alert.trigger, alert.detail) : desk.tick());
  if (!stopped) timer = setTimeout(loop, refreshMs);
}
await loop();

const current = (): FairValue =>
  desk.mode() === "halted" ? { ok: false, reason: `halted: ${desk.reason()}` } : pricer.current();

const server = createFeedServer(current).listen(port, host, () => {
  console.log(`feed on http://${host}:${port}${FEED_PATH}`);
});

process.on("SIGTERM", () => {
  stopped = true;
  clearTimeout(timer);
  server.close();
});
