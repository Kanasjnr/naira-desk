import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  IDENTITY_REGISTRY,
  identityRegistryAbi,
  isTxTagged,
  readKeyFile,
} from "@naira-desk/chain";
import { formatEther, type Hash, http, parseEventLogs } from "viem";
import { cardFor } from "./card.ts";
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
const [balance, owned] = await Promise.all([
  client.getBalance({ address: agent }),
  client.readContract({ ...registry, functionName: "balanceOf", args: [agent] }),
]);
console.log(`agent ${agent}, balance ${formatEther(balance)} CELO`);
if (owned > 0n) stop(`${agent} already has an agent identity`);

// The card points back at its own registration, so predict the id before sending.
const { result: expectedId } = await client.simulateContract({
  ...registry,
  account: agent,
  functionName: "register",
  args: [cardFor(0n)],
});
console.log(`register() simulates fine, expected agent id ${expectedId}`);

if (balance === 0n) {
  if (!dryRun) stop(`fund ${agent} with a little CELO first`);
  console.log(`not funded yet: send a little CELO to ${agent}`);
}
if (dryRun) process.exit(0);

async function confirm(hash: Hash) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") stop(`${hash} reverted`);
  console.log(`https://celoscan.io/tx/${hash}`);
  return receipt;
}

const receipt = await confirm(
  await wallet.writeContract({
    ...registry,
    functionName: "register",
    args: [cardFor(expectedId)],
  }),
);
const agentId = parseEventLogs({
  abi: identityRegistryAbi,
  eventName: "Registered",
  logs: receipt.logs,
})[0]?.args.agentId;
if (agentId === undefined) stop("register() succeeded but emitted no Registered event");

// Another registration can land between simulation and mining and shift the id.
if (agentId !== expectedId) {
  await confirm(
    await wallet.writeContract({
      ...registry,
      functionName: "setAgentURI",
      args: [agentId, cardFor(agentId)],
    }),
  );
}

console.log(`registered agent ${agentId}`);

// Signing already refuses untagged transactions; this only reports what landed.
const tagged = await isTxTagged(client, receipt.transactionHash).catch(() => null);
console.log(tagged === null ? "tag not checked yet, see Celoscan" : `tagged: ${tagged}`);
