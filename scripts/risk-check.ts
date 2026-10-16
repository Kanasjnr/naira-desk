import { chatRequest, checkNairaRisk, NEWS_QUERY, quote, xSearchRequest } from "@naira-desk/intel";
import { agentBuyer, usd } from "./buyer.ts";

const dryRun = process.argv.includes("--dry-run");

const [search, rating] = await Promise.all([
  quote(xSearchRequest(NEWS_QUERY)),
  quote(chatRequest([{ role: "user", content: "quote" }])),
]);
console.log(`a risk check buys an X search (${usd(search)}) and a Cencori rating (${usd(rating)})`);
if (dryRun) process.exit(0);

const { buyer, spentToday } = await agentBuyer();
const check = await checkNairaRisk(buyer).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
console.log(`risk ${check.level}: ${check.reason}`);
console.log(`posts rated: ${check.posts}`);
for (const hash of check.receipts) console.log(`paid: https://celoscan.io/tx/${hash}`);
console.log(`spent in the last 24h: ${spentToday()}`);
