import { CELO_CHAIN_ID } from "@naira-desk/shared";
import type { Address, Hash, Hex } from "viem";

const API = "https://api.textilecredit.com/v2";

// One direction of a pair: what a taker gets for each size it sells, Textile's fee included.
export type Ladder = {
  sellToken: Address;
  buyToken: Address;
  sellDecimals: number;
  buyDecimals: number;
  maxSellAmount: string;
  levels: { sellAmount: string; buyAmount: string }[];
};

export type TakerProof = { nonce: Hex; issuedAt: number; signature: Hex; scheme: "eip191" };

export type FirmQuote =
  | {
      status: "quoted";
      rfqId: string;
      claimToken: string;
      quote: {
        sellAmount: string;
        buyAmount: string;
        takerPays: string;
        taker: Address;
        reactor: Address;
        spender: Address;
        orders: { maker: Address }[];
      };
      transactions: { swap: { to: Address; data: Hex } };
    }
  | { status: "no_quote"; reason?: string };

// Textile checks the taker holds the sell token, less what its other live quotes have reserved.
export class InsufficientFunds extends Error {
  readonly required: bigint;
  readonly available: bigint;
  readonly committed: bigint;

  constructor(route: string, required: bigint, available: bigint, committed: bigint) {
    super(
      `textile ${route}: insufficient_funds (required ${required}, available ${available}, committed ${committed})`,
    );
    this.required = required;
    this.available = available;
    this.committed = committed;
  }

  get free() {
    return this.available > this.committed ? this.available - this.committed : 0n;
  }
}

type Details = { reason?: string; required?: string; available?: string; committed?: string };

async function call<T>(fetchFn: typeof fetch, path: string, init?: RequestInit): Promise<T> {
  // Firm quotes can wait up to ~70s for makers on a cold corridor.
  const response = await fetchFn(`${API}${path}`, { ...init, signal: AbortSignal.timeout(75_000) });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string; details?: Details };
  };
  if (!response.ok || !body.data) {
    const route = path.split("?")[0] ?? path;
    const details = body.error?.details;
    if (details?.reason === "insufficient_funds") {
      throw new InsufficientFunds(
        route,
        BigInt(details.required ?? 0),
        BigInt(details.available ?? 0),
        BigInt(details.committed ?? 0),
      );
    }
    throw new Error(
      `textile ${route}: ${details?.reason ?? body.error?.message ?? response.status}`,
    );
  }
  return body.data;
}

export async function rfqLadders(fetchFn: typeof fetch = fetch) {
  const data = await call<{ pairs: Ladder[] }>(fetchFn, `/rfq/levels?chainId=${CELO_CHAIN_ID}`);
  return data.pairs;
}

export function requestQuote(
  request: { sellToken: Address; buyToken: Address; sellAmount: bigint; taker: Address },
  proof: TakerProof,
  fetchFn: typeof fetch = fetch,
) {
  return call<FirmQuote>(fetchFn, "/rfq/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: CELO_CHAIN_ID,
      ...request,
      sellAmount: request.sellAmount.toString(),
      takerProof: proof,
    }),
  });
}

const claimed = (claimToken: string, body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-rfq-claim": claimToken },
  body: JSON.stringify(body ?? {}),
});

// Cancelling doesn't free the maker's liquidity before the order deadline, but tells Textile.
export function cancelQuote(rfqId: string, claimToken: string, fetchFn: typeof fetch = fetch) {
  return call(fetchFn, `/rfq/${rfqId}/cancel`, claimed(claimToken));
}

export function reportFill(
  rfqId: string,
  claimToken: string,
  txHash: Hash,
  fetchFn: typeof fetch = fetch,
) {
  return call(fetchFn, `/rfq/${rfqId}/submit`, claimed(claimToken, { txHash }));
}
