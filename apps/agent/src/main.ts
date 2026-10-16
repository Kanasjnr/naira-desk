import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
  tokenBalance,
} from "@naira-desk/chain";
import { checkNairaRisk, createBuyer, openLedger } from "@naira-desk/intel";
import { cngnSources, type FairValue } from "@naira-desk/pricing";
import { http } from "viem";
import { createRiskDesk, openDecisions } from "./desk.ts";
import { files, rpcUrl } from "./env.ts";
import { createFeedServer, FEED_PATH } from "./feed.ts";
import { createPricer } from "./pricer.ts";
import { createReviewer, feedbackPoster } from "./reviews.ts";
import { againstStreet } from "./street.ts";
import { createPriceWatch } from "./watch.ts";

const env = process.env;
const host = env.FEED_HOST || "127.0.0.1";
const port = Number(env.FEED_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`invalid FEED_PORT: ${env.FEED_PORT}`);
}
const refreshMs = 5_000;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const pricer = createPricer(cngnSources(client));

const wallet = createTaggedWalletClient(await readKeyFile(files.key), http(rpcUrl));
const buyer = createBuyer({
  account: wallet.account,
  ledger: await openLedger(files.ledger),
  readBalance: tokenBalance(client),
});
const decisions = await openDecisions(files.decisions);
const desk = createRiskDesk({
  check: async () => againstStreet(await checkNairaRisk(buyer), pricer.current()),
  log: decisions,
});
const reviewer = await createReviewer({
  client: wallet.account.address,
  decisions: decisions.all,
  give: feedbackPoster(wallet, client),
  logPath: files.reviews,
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
  void reviewer.tick();
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
