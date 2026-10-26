import {
  type createCeloPublicClient,
  REACTOR,
  TAKER,
  takerAbi,
  UNISWAP_QUOTER,
  uniswapQuoterAbi,
  VAULT,
} from "@naira-desk/chain";
import { USDT } from "@naira-desk/shared";
import { type Address, concat, type Hex, isAddressEqual, numberToHex, toHex } from "viem";
import type { PoolQuoter } from "./gaps.ts";
import type { FirmQuote, TakerProof } from "./rfq.ts";

type Client = Pick<ReturnType<typeof createCeloPublicClient>, "readContract" | "simulateContract">;
type Signer = { signMessage(args: { message: string }): Promise<Hex> };

// Textile asks the Taker to vouch for its taker-control text. The Taker only vouches when the
// text is rebuilt from the nonce and issuedAt in front of the agent's signature, so the agent
// signs exactly the text the contract builds.
export async function takerProof(client: Client, agent: Signer): Promise<TakerProof> {
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const issuedAt = Date.now();
  const message = await client.readContract({
    address: TAKER,
    abi: takerAbi,
    functionName: "takerControl",
    args: [nonce, BigInt(issuedAt)],
  });
  const signed = await agent.signMessage({ message });
  const signature = concat([nonce, numberToHex(issuedAt, { size: 32 }), signed]);
  return { nonce, issuedAt, signature, scheme: "eip191" };
}

// A pool that can't fill the amount at all pays nothing.
export const poolQuoter =
  (client: Client): PoolQuoter =>
  async (market, amountIn) => {
    try {
      const { result } = await client.simulateContract({
        address: UNISWAP_QUOTER,
        abi: uniswapQuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: market.token,
            tokenOut: USDT,
            amountIn,
            fee: market.fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      return result[0];
    } catch {
      return 0n;
    }
  };

// Why a firm quote can't go to the Taker as is, if it can't.
export function quoteProblem(quote: FirmQuote, float: bigint): string | undefined {
  if (quote.status !== "quoted") return `no quote: ${quote.reason ?? "no reason given"}`;
  const { quote: q, transactions } = quote;
  if (!isAddressEqual(q.taker, TAKER)) return `quote is for ${q.taker}, not the Taker`;
  const routed: Address[] = [q.reactor, q.spender, transactions.swap.to];
  if (!routed.every((address) => isAddressEqual(address, REACTOR))) {
    return "quote doesn't settle through the reactor";
  }
  if (q.orders.some((order) => isAddressEqual(order.maker, VAULT))) return "maker is our own vault";
  if (BigInt(q.takerPays) > float) return `quote needs ${q.takerPays}, the Taker holds ${float}`;
  return undefined;
}
