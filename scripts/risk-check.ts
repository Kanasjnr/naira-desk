import {
  chatRequest,
  checkNairaRisk,
  NEWS_QUERY,
  quote,
  RATES_QUERY,
  receiptsOf,
  xSearchRequest,
} from "@naira-desk/intel";
import { agentBuyer, usd } from "./buyer.ts";

const dryRun = process.argv.includes("--dry-run");

const [news, rates, rating] = await Promise.all([
  quote(xSearchRequest(NEWS_QUERY)),
  quote(xSearchRequest(RATES_QUERY)),
  quote(chatRequest([{ role: "user", content: "quote" }])),
]);
console.log(
  `a risk check buys a news search (${usd(news)}), a street-rate search (${usd(rates)}) and a Cencori rating (${usd(rating)})`,
);
if (dryRun) process.exit(0);

const { buyer, spentToday } = await agentBuyer();
const check = await checkNairaRisk(buyer).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
const naira = (rate?: number) => (rate ? `₦${rate}` : "not quoted");
console.log(`risk ${check.level}: ${check.reason}`);
console.log(`official ${naira(check.rates?.official)}, parallel ${naira(check.rates?.parallel)}`);
console.log(`posts rated: ${check.posts}`);
for (const hash of receiptsOf(check)) console.log(`paid: https://celoscan.io/tx/${hash}`);
console.log(`spent in the last 24h: ${spentToday()}`);
