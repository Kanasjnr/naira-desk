import { fromDataSuffix, withAttribution } from "@celo/attribution-tags";
import { ATTRIBUTION_CODE } from "@naira-desk/shared";
import { createWalletClient, type Hash, type Hex, type LocalAccount, type Transport } from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { celo } from "viem/chains";

class UntaggedTransactionError extends Error {
  override name = "UntaggedTransactionError";
}

// viem wraps signing errors, so check the whole cause chain.
export function isUntaggedError(error: unknown) {
  let e: unknown = error;
  for (let depth = 0; e instanceof Error && depth < 10; depth++, e = e.cause) {
    if (e instanceof UntaggedTransactionError) return true;
  }
  return false;
}

// Schema 2 tags carry several roles; we only count as tagged when we're the app.
export function hasOurTag(data: Hex) {
  const tag = fromDataSuffix(data);
  if (!tag) return false;
  return tag.schemaId === 0 ? tag.codes.includes(ATTRIBUTION_CODE) : tag.app === ATTRIBUTION_CODE;
}

type TransactionReader = { getTransaction(args: { hash: Hash }): Promise<{ input: Hex }> };

// Unlike the SDK's verifyTx, lookup failures throw instead of reading as untagged.
export async function isTxTagged(client: TransactionReader, hash: Hash) {
  const { input } = await client.getTransaction({ hash });
  return hasOurTag(input);
}

export function requireTagOnSign(account: LocalAccount) {
  const signTransaction: LocalAccount["signTransaction"] = async (tx, options) => {
    if (!hasOurTag(tx.data ?? "0x")) {
      throw new UntaggedTransactionError(`missing attribution code ${ATTRIBUTION_CODE}`);
    }
    return account.signTransaction(tx, options);
  };

  return toAccount({
    address: account.address,
    signMessage: account.signMessage,
    signTypedData: account.signTypedData,
    signTransaction,
  });
}

export function createTaggedWalletClient(privateKey: Hex, transport: Transport) {
  const client = createWalletClient({
    account: requireTagOnSign(privateKeyToAccount(privateKey)),
    chain: celo,
    transport,
  }).extend(withAttribution(ATTRIBUTION_CODE));

  // Only methods withAttribution wraps. Anything else would be refused at signing.
  return {
    account: client.account,
    sendTransaction: client.sendTransaction,
    writeContract: client.writeContract,
    signMessage: client.signMessage,
    signTypedData: client.signTypedData,
  };
}
