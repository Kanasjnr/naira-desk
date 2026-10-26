import {
  type createCeloPublicClient,
  type createTaggedWalletClient,
  REACTOR,
  TAKER,
  takerAbi,
  UNISWAP_QUOTER,
  uniswapQuoterAbi,
  VAULT,
} from "@naira-desk/chain";
import { briefError, USDT } from "@naira-desk/shared";
import {
  type Address,
  concat,
  type Hash,
  type Hex,
  isAddressEqual,
  numberToHex,
  parseEventLogs,
  toHex,
} from "viem";
import type { Gap, PoolQuoter } from "./gaps.ts";
import { cancelQuote, type FirmQuote, reportFill, requestQuote, type TakerProof } from "./rfq.ts";

type Client = Pick<ReturnType<typeof createCeloPublicClient>, "readContract" | "simulateContract">;
type Chain = Client & Pick<ReturnType<typeof createCeloPublicClient>, "waitForTransactionReceipt">;
type Wallet = Pick<
  ReturnType<typeof createTaggedWalletClient>,
  "account" | "signMessage" | "writeContract"
>;
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

export type Took = { hash: Hash; spent: bigint; received: bigint; gasPaid: bigint };

// Asks Textile for a firm quote in the Taker's name, checks it, simulates the take and only then
// sends it. Anything short of a landed take throws, and an unused quote is cancelled.
export async function takeGap(
  { client, wallet, fetchFn = fetch }: { client: Chain; wallet: Wallet; fetchFn?: typeof fetch },
  gap: Gap,
  float: bigint,
  minProfit: bigint,
): Promise<Took> {
  const quote = await requestQuote(
    { sellToken: USDT, buyToken: gap.market.token, sellAmount: gap.spend, taker: TAKER },
    await takerProof(client, wallet),
    fetchFn,
  );
  if (quote.status !== "quoted") throw new Error(quoteProblem(quote, float) ?? "no quote");
  const cancel = () => cancelQuote(quote.rfqId, quote.claimToken, fetchFn).catch(() => {});
  const problem = quoteProblem(quote, float);
  if (problem) {
    await cancel();
    throw new Error(problem);
  }

  const call = {
    address: TAKER,
    abi: takerAbi,
    functionName: "take",
    args: [quote.transactions.swap.data, gap.market.token, gap.market.fee, minProfit],
  } as const;
  try {
    await client.simulateContract({ ...call, account: wallet.account.address });
  } catch (error) {
    await cancel();
    throw new Error(`the firm quote doesn't pay: ${briefError(error)}`);
  }

  const hash = await wallet.writeContract(call);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`the take reverted [${hash}]`);
  await reportFill(quote.rfqId, quote.claimToken, hash, fetchFn).catch((error) =>
    console.warn(`couldn't report the fill to Textile: ${briefError(error)}`),
  );
  const [took] = parseEventLogs({ abi: takerAbi, eventName: "Took", logs: receipt.logs });
  if (!took) throw new Error(`the take emitted no Took event [${hash}]`);
  const { spent, received } = took.args;
  return { hash, spent, received, gasPaid: receipt.gasUsed * receipt.effectiveGasPrice };
}
