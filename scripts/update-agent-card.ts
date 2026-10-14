import {
  AGENT_ID,
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  IDENTITY_REGISTRY,
  identityRegistryAbi,
  isTxTagged,
  readKeyFile,
} from "@naira-desk/chain";
import { http, isAddressEqual } from "viem";
import { agentCard, cardFor } from "./card.ts";
import { keyFile, rpcUrl } from "./env.ts";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const registry = { address: IDENTITY_REGISTRY, abi: identityRegistryAbi } as const;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);

const wallet = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const agent = wallet.account.address;
const [owner, current] = await Promise.all([
  client.readContract({ ...registry, functionName: "ownerOf", args: [AGENT_ID] }),
  client.readContract({ ...registry, functionName: "tokenURI", args: [AGENT_ID] }),
]);
if (!isAddressEqual(owner, agent)) stop(`agent ${AGENT_ID} belongs to ${owner}, not ${agent}`);

const uri = cardFor(AGENT_ID);
if (uri === current) {
  console.log(`agent ${AGENT_ID} card is already up to date`);
  process.exit(0);
}

await client.simulateContract({
  ...registry,
  account: agent,
  functionName: "setAgentURI",
  args: [AGENT_ID, uri],
});
console.log(`agent ${AGENT_ID} card will list:`);
for (const { name, endpoint } of agentCard(AGENT_ID).services) {
  console.log(`  ${name.padEnd(6)} ${endpoint}`);
}
if (dryRun) process.exit(0);

const hash = await wallet.writeContract({
  ...registry,
  functionName: "setAgentURI",
  args: [AGENT_ID, uri],
});
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") stop(`${hash} reverted`);
console.log(`https://celoscan.io/tx/${hash}`);

// Signing already refuses untagged transactions; this only reports what landed.
const tagged = await isTxTagged(client, hash).catch(() => null);
console.log(tagged === null ? "tag not checked yet, see Celoscan" : `tagged: ${tagged}`);
