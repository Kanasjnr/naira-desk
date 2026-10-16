import { CELO_CHAIN_ID } from "@naira-desk/shared";
import {
  type Address,
  createPublicClient,
  erc20Abi,
  type PublicClient,
  type Transport,
} from "viem";
import { celo } from "viem/chains";

export const DEFAULT_RPC_URL = "https://forno.celo.org";

export function createCeloPublicClient(transport: Transport) {
  return createPublicClient({ chain: celo, transport });
}

export async function assertCeloMainnet(client: { getChainId(): Promise<number> }) {
  const chainId = await client.getChainId();
  if (chainId !== CELO_CHAIN_ID) {
    throw new Error(`expected Celo mainnet (${CELO_CHAIN_ID}), RPC is on chain ${chainId}`);
  }
}

export const tokenBalance =
  (client: Pick<PublicClient, "readContract">) => (token: Address, owner: Address) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
