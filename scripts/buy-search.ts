import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
} from "@naira-desk/chain";
import { createBuyer, openLedger, quoteXSearch } from "@naira-desk/intel";
import { erc20Abi, formatUnits, http } from "viem";
import { keyFile, ledgerFile, rpcUrl } from "./env.ts";

const query = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!query) {
  console.error('usage: pnpm buy:search "<query>" [--dry-run]');
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const usd = (atomic: bigint) => `$${formatUnits(atomic, 6)}`;

console.log(`X search for "${query}" costs ${usd(await quoteXSearch(query))}`);
if (dryRun) process.exit(0);

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const { account } = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const ledger = await openLedger(ledgerFile);
const buyer = createBuyer({
  account,
  ledger,
  readBalance: (token, owner) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
});

const result = await buyer.searchX(query).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
console.dir(result, { depth: 4 });

const receipt = ledger.last();
if (receipt?.txHash) console.log(`paid: https://celoscan.io/tx/${receipt.txHash}`);
console.log(`spent in the last 24h: ${usd(ledger.spentSince(Date.now() - 86_400_000))}`);
