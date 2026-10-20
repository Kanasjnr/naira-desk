import { quote, xSearchRequest } from "@naira-desk/intel";
import { agentBuyer, usd } from "./buyer.ts";

const query = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!query) {
  console.error('usage: pnpm buy:search "<query>" [--dry-run]');
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");

console.log(`X search for "${query}" costs ${usd(await quote(xSearchRequest(query)))}`);
if (dryRun) process.exit(0);

const { buyer, spentToday } = await agentBuyer();
const { data, txHash } = await buyer.searchX(query).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
console.dir(data, { depth: 4 });
if (txHash) console.log(`paid: https://celoscan.io/tx/${txHash}`);
console.log(`spent in the last 24h: ${spentToday()}`);
