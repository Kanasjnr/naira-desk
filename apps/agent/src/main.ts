import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
  TAKER,
  tokenBalance,
} from "@naira-desk/chain";
import { checkNairaRisk, createBuyer, openLedger } from "@naira-desk/intel";
import { cngnSources, type FairValue } from "@naira-desk/pricing";
import { appendJsonl, readJsonl, USDT } from "@naira-desk/shared";
import { formatUnits, http } from "viem";
import { createApiServer, QUOTE_PATH } from "./api.ts";
import { createRiskDesk, openDecisions } from "./desk.ts";
import { files, rpcUrl } from "./env.ts";
import { createFeedServer, FEED_PATH } from "./feed.ts";
import { authorizationSettler, createPaywall } from "./paywall.ts";
import { createPricer } from "./pricer.ts";
import { nairaQuote } from "./quote.ts";
import { openRateHistory } from "./rates.ts";
import { createReviewer, feedbackPoster } from "./reviews.ts";
import { rfqLadders } from "./rfq.ts";
import { againstStreet } from "./street.ts";
import { poolQuoter, takeGap } from "./taker.ts";
import { buildTape, type Sale } from "./tape.ts";
import { createTrader, type Trade } from "./trader.ts";
import { createPriceWatch } from "./watch.ts";

const env = process.env;
function portFrom(name: string, fallback: number) {
  const port = Number(env[name] || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ${name}: ${env[name]}`);
  }
  return port;
}
const host = env.FEED_HOST || "127.0.0.1";
const port = portFrom("FEED_PORT", 8787);
const apiHost = env.API_HOST || "127.0.0.1";
const apiPort = portFrom("API_PORT", 8788);
const apiUrl = env.API_URL || `http://${apiHost}:${apiPort}`;
const refreshMs = 5_000;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const pricer = createPricer(cngnSources(client));

const wallet = createTaggedWalletClient(await readKeyFile(files.key), http(rpcUrl));
const ledger = await openLedger(files.ledger);
const buyer = createBuyer({ account: wallet.account, ledger, readBalance: tokenBalance(client) });
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
const takes = env.TAKES !== "off";
const trades = await readJsonl<Trade>(files.trades);
const trader = createTrader({
  ladders: () => rfqLadders(),
  float: () => tokenBalance(client)(USDT, TAKER),
  gasPrice: async () => (await client.estimateFeesPerGas()).maxFeePerGas,
  gasLeft: () => client.getBalance({ address: wallet.account.address }),
  poolPays: poolQuoter(client),
  take: (gap, float, minProfit) => takeGap({ client, wallet }, gap, float, minProfit),
  log: (trade) => {
    trades.push(trade);
    return appendJsonl(files.trades, trade);
  },
  takes,
});
console.log(`trader ${takes ? "taking" : "watching"} Textile gaps for the Taker at ${TAKER}`);
const watch = createPriceWatch();
const rates = await openRateHistory(files.rates);
let taggedTxs: number | null = null;
const countTagged = () =>
  client
    .getTransactionCount({ address: wallet.account.address })
    .then((count) => {
      taggedTxs = count;
    })
    .catch(() => {});
const sales = await readJsonl<Sale>(files.sales);

const restored = desk.current();
if (restored) console.log(`restored ${restored.mode} from ${new Date(restored.at).toISOString()}`);

// Wait for each refresh to finish before scheduling the next, so slow sources can't pile up.
// Risk checks run alongside and never hold up the feed.
let timer: NodeJS.Timeout | undefined;
let countedAt = 0;
let stopped = false;
async function loop() {
  await pricer.refresh();
  const value = pricer.current();
  const alert = watch(value, Date.now());
  void rates
    .observe(value, Date.now())
    .catch((error) => console.error("failed to log a rate", error));
  void (alert ? desk.alert(alert.trigger, alert.detail) : desk.tick());
  void reviewer.tick();
  void trader.tick();
  if (Date.now() - countedAt >= 60_000) {
    countedAt = Date.now();
    void countTagged();
  }
  if (!stopped) timer = setTimeout(loop, refreshMs);
}
await loop();

const current = (): FairValue =>
  desk.mode() === "halted" ? { ok: false, reason: `halted: ${desk.reason()}` } : pricer.current();

const server = createFeedServer(current).listen(port, host, () => {
  console.log(`feed on http://${host}:${port}${FEED_PATH}`);
});

const paywall = createPaywall({
  // Settling costs the agent about $0.0015 in gas, so this keeps a margin.
  price: 5_000n,
  payTo: wallet.account.address,
  resource: `${apiUrl}${QUOTE_PATH}`,
  description: "Naira Desk: onchain, official and street naira rates with the agent's risk call",
  chain: client,
  settle: authorizationSettler(wallet, client),
});
const api = createApiServer({
  quote: () => nairaQuote(pricer.current(), desk.current()),
  tape: () =>
    buildTape({
      decisions: decisions.all(),
      purchases: ledger.all(),
      reviews: reviewer.history(),
      sales,
      rates: rates.samples(),
      trades,
      trader: trader.status(),
      wallet: wallet.account.address,
      taggedTxs,
      now: Date.now(),
    }),
  paywall,
  onSale: (sale) => {
    console.log(
      `sold a quote to ${sale.payer} for $${formatUnits(BigInt(sale.amount), 6)} [${sale.txHash}]`,
    );
    const entry = { at: Date.now(), ...sale };
    sales.push(entry);
    appendJsonl(files.sales, entry).catch((error) => console.error("failed to log a sale", error));
  },
}).listen(apiPort, apiHost, () => {
  console.log(`naira api on ${apiUrl}${QUOTE_PATH}`);
});

process.on("SIGTERM", () => {
  stopped = true;
  clearTimeout(timer);
  server.close();
  api.close();
});
