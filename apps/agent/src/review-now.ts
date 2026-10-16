import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  REPUTATION_REGISTRY,
  readKeyFile,
  reputationRegistryAbi,
} from "@naira-desk/chain";
import { formatEther, http } from "viem";
import { openDecisions } from "./desk.ts";
import { files, rpcUrl } from "./env.ts";
import { createReviewer, feedbackArgs, feedbackPoster } from "./reviews.ts";

const dryRun = process.argv.includes("--dry-run");

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const wallet = createTaggedWalletClient(await readKeyFile(files.key), http(rpcUrl));
const decisions = await openDecisions(files.decisions);
const reviewer = await createReviewer({
  client: wallet.account.address,
  decisions: decisions.all,
  give: feedbackPoster(wallet, client),
  logPath: files.reviews,
});

const pending = reviewer.pending();
if (pending.length === 0) {
  console.log("nothing to review since the last reviews");
  process.exit(0);
}

const fees = await client.estimateFeesPerGas();
for (const file of pending) {
  const call = {
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: feedbackArgs(file),
    account: wallet.account.address,
  } as const;
  await client.simulateContract(call);
  const gas = await client.estimateContractGas(call);
  console.log(
    `${file.tag2} (agent #${file.agentId}): ${file.value}/100, ${file.delivered}/${file.calls} delivered, ${file.decisionsInformed} decisions, ${file.modeChanges} mode changes, up to ${formatEther(gas * fees.maxFeePerGas)} CELO`,
  );
}
if (dryRun) process.exit(0);

await reviewer.review();
