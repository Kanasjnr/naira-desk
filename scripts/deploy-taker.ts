import { readFile } from "node:fs/promises";
import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  isTxTagged,
  REACTOR,
  readKeyFile,
  SWAP_ROUTER,
  takerAbi,
} from "@naira-desk/chain";
import { USDT } from "@naira-desk/shared";
import { encodeDeployData, formatEther, getAddress, type Hex, http, isAddressEqual } from "viem";
import { keyFile, rpcUrl } from "./env.ts";

// The operator's own wallet: the only place the Taker can ever pay out to.
const BENEFICIARY = "0xa1599790B763E537bd15b5b912012e5Fb65491a3";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

// `pnpm taker:deploy` runs `forge build` in packages/contracts first.
const artifact = new URL("../packages/contracts/out/Taker.sol/Taker.json", import.meta.url);
const { bytecode } = JSON.parse(await readFile(artifact, "utf8")) as { bytecode: { object: Hex } };

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);

const wallet = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const agent = wallet.account.address;
const args = [agent, BENEFICIARY, REACTOR, USDT, SWAP_ROUTER] as const;
const data = encodeDeployData({ abi: takerAbi, bytecode: bytecode.object, args });

const [gas, fees, balance] = await Promise.all([
  client.estimateGas({ account: agent, data }),
  client.estimateFeesPerGas(),
  client.getBalance({ address: agent }),
]);
const maxCost = gas * fees.maxFeePerGas;

console.log(`owner    ${agent}`);
console.log(`pays out ${BENEFICIARY}`);
console.log(`reactor  ${REACTOR}`);
console.log(`usdt     ${USDT}`);
console.log(`router   ${SWAP_ROUTER}`);
console.log(`gas      up to ${formatEther(maxCost)} CELO, have ${formatEther(balance)}`);

if (balance < maxCost) {
  if (!dryRun) stop(`send more CELO to ${agent} first`);
  console.log(`not enough CELO yet: top up ${agent}`);
}
if (dryRun) process.exit(0);

const hash = await wallet.sendTransaction({ data });
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) stop(`${hash} failed`);
const taker = getAddress(receipt.contractAddress);
console.log(`https://celoscan.io/tx/${hash}`);
console.log(`taker    ${taker}`);

// Read the settings back from the contract rather than trusting what was sent.
const settings = [
  ["owner", agent],
  ["beneficiary", BENEFICIARY],
  ["reactor", REACTOR],
  ["usdt", USDT],
  ["router", SWAP_ROUTER],
] as const;
for (const [functionName, expected] of settings) {
  const actual = await client.readContract({ address: taker, abi: takerAbi, functionName });
  if (!isAddressEqual(actual, expected)) stop(`${functionName} is ${actual}, expected ${expected}`);
}
console.log("settings match");

// Signing already refuses untagged transactions; this only reports what landed.
const tagged = await isTxTagged(client, hash).catch(() => null);
console.log(tagged === null ? "tag not checked yet, see Celoscan" : `tagged: ${tagged}`);
console.log(`next: pnpm taker:verify ${hash}`);
