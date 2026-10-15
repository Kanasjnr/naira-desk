import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  isTxTagged,
  readKeyFile,
  VAULT_FACTORY,
  vaultFactoryAbi,
  vaultInit,
} from "@naira-desk/chain";
import { CNGN, USDT } from "@naira-desk/shared";
import { formatEther, formatUnits, http, parseEventLogs, zeroAddress } from "viem";
import { keyFile, rpcUrl } from "./env.ts";

// The operator's own wallet, so fee shares never sit with the agent's hot key.
const FEE_RECIPIENT = "0xa1599790B763E537bd15b5b912012e5Fb65491a3";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const factory = { address: VAULT_FACTORY, abi: vaultFactoryAbi } as const;

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);

const wallet = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const agent = wallet.account.address;
const existing = await client.readContract({
  ...factory,
  functionName: "vaultOf",
  args: [agent, USDT, CNGN],
});
if (existing !== zeroAddress) stop(`${agent} already has a vault: ${existing}`);

const init = vaultInit({ operator: agent, feeRecipient: FEE_RECIPIENT });
const call = { ...factory, account: agent, functionName: "deployVault", args: [init] } as const;
const [{ result: expected }, gas, fees, balance] = await Promise.all([
  client.simulateContract(call),
  client.estimateContractGas(call),
  client.estimateFeesPerGas(),
  client.getBalance({ address: agent }),
]);
const maxCost = gas * fees.maxFeePerGas;
const amount = (value: bigint) => formatUnits(value, 6);
const percent = (wad: bigint) => `${formatUnits(wad, 16)}%`;

console.log(`${init.name} simulates fine, expected at ${expected}`);
console.log(`owner and bot key  ${agent}`);
console.log(`fee recipient      ${init.feeRecipient}`);
console.log(
  `fees               ${percent(init.managementFeeWad)} management, ${percent(init.performanceFeeWad)} performance`,
);
console.log(
  `max order          ${amount(init.maxOrderInputSettlement)} USDT / ${amount(init.maxOrderInputCorridor)} cNGN`,
);
console.log(
  `min deposit        ${amount(init.minDepositAssets)} USDT / ${amount(init.minDepositCorridor)} cNGN`,
);
console.log(`gas                up to ${formatEther(maxCost)} CELO, have ${formatEther(balance)}`);

if (balance < maxCost) {
  if (!dryRun) stop(`send more CELO to ${agent} first`);
  console.log(`not enough CELO yet: top up ${agent}`);
}
if (dryRun) process.exit(0);

const hash = await wallet.writeContract({ ...factory, functionName: "deployVault", args: [init] });
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") stop(`${hash} reverted`);
console.log(`https://celoscan.io/tx/${hash}`);

const vault = parseEventLogs({
  abi: vaultFactoryAbi,
  eventName: "VaultDeployed",
  logs: receipt.logs,
})[0]?.args.vault;
if (!vault) stop("deployVault() succeeded but emitted no VaultDeployed event");
console.log(`vault ${vault}`);

// Signing already refuses untagged transactions; this only reports what landed.
const tagged = await isTxTagged(client, hash).catch(() => null);
console.log(tagged === null ? "tag not checked yet, see Celoscan" : `tagged: ${tagged}`);
