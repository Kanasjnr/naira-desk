import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
  tokenBalance,
} from "@naira-desk/chain";
import { createBuyer, openLedger } from "@naira-desk/intel";
import { formatUnits, http } from "viem";
import { keyFile, ledgerFile, rpcUrl } from "./env.ts";

export const usd = (atomic: bigint) => `$${formatUnits(atomic, 6)}`;

export async function agentBuyer() {
  const client = createCeloPublicClient(http(rpcUrl));
  await assertCeloMainnet(client);
  const { account } = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
  const ledger = await openLedger(ledgerFile);
  const buyer = createBuyer({ account, ledger, readBalance: tokenBalance(client) });
  const spentToday = () => usd(ledger.spentSince(Date.now() - 86_400_000));
  return { buyer, spentToday };
}
