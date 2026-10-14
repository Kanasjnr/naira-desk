import { CELO_CHAIN_ID } from "@naira-desk/shared";
import { createPublicClient, type Transport } from "viem";
import { celo } from "viem/chains";

export function createCeloPublicClient(transport: Transport) {
  return createPublicClient({ chain: celo, transport });
}

export async function assertCeloMainnet(client: { getChainId(): Promise<number> }) {
  const chainId = await client.getChainId();
  if (chainId !== CELO_CHAIN_ID) {
    throw new Error(`expected Celo mainnet (${CELO_CHAIN_ID}), RPC is on chain ${chainId}`);
  }
}
