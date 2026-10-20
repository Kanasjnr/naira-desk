import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  isTxTagged,
  operatorVaultAbi,
  readKeyFile,
  VAULT,
} from "@naira-desk/chain";
import { http, isAddress, isAddressEqual } from "viem";
import { keyFile, rpcUrl } from "./env.ts";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const next = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!next || !isAddress(next))
  stop("usage: pnpm vault:set-signer <stitch bot address> [--dry-run]");
const dryRun = process.argv.includes("--dry-run");
const vault = { address: VAULT, abi: operatorVaultAbi } as const;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const wallet = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const agent = wallet.account.address;

const [owner, current, riskSigner, code] = await Promise.all([
  client.readContract({ ...vault, functionName: "operatorAdmin" }),
  client.readContract({ ...vault, functionName: "strategySigner" }),
  client.readContract({ ...vault, functionName: "riskSigner" }),
  client.getCode({ address: next }),
]);
if (!isAddressEqual(owner, agent)) stop(`the vault belongs to ${owner}, not ${agent}`);
if (isAddressEqual(current, next)) stop(`${next} is already the strategy signer`);
if (isAddressEqual(riskSigner, next)) stop("the strategy signer can't be Textile's risk signer");
// Stitch signs with a plain key; a contract here could never sign a quote.
if (code && code !== "0x") stop(`${next} is a contract, not a wallet`);

await client.simulateContract({
  ...vault,
  account: agent,
  functionName: "setStrategySigner",
  args: [next],
});
console.log(`strategy signer ${current} -> ${next}`);
console.log("this cancels any orders the old signer had out");
if (dryRun) process.exit(0);

const hash = await wallet.writeContract({
  ...vault,
  functionName: "setStrategySigner",
  args: [next],
});
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") stop(`${hash} reverted`);
console.log(`https://celoscan.io/tx/${hash}`);

// Signing already refuses untagged transactions; this only reports what landed.
const tagged = await isTxTagged(client, hash).catch(() => null);
console.log(tagged === null ? "tag not checked yet, see Celoscan" : `tagged: ${tagged}`);
