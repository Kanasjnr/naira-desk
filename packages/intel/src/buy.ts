import { tokenBySymbol, x402 } from "@celo/buy-core";
import type { Address, LocalAccount } from "viem";
import type { Ledger } from "./ledger.ts";

export const GATEWAY = "https://gateway.usebuy.ai";
const DAY = 86_400_000;
// The gateway takes any of these. All are 6-decimal dollars, so spend adds up across them.
const TOKENS = ["USDC", "USDT", "USAT"] as const;

type Request = { capability: string; path: string; body: unknown };
export type Message = { role: "system" | "user"; content: string };

export const xSearchRequest = (query: string): Request => ({
  capability: "x.posts.search",
  path: "/v1/social/x/posts/search",
  body: { query, type: "latest" },
});

// Cencori serves one model in its closed beta, at a flat price whatever the output length.
export const chatRequest = (messages: Message[]): Request => ({
  capability: "cencori.v1.chat.completions",
  path: "/cencori/v1/chat/completions",
  body: { model: "maximo-atlas-1.3", max_tokens: 256, temperature: 0, messages },
});

// The providers' ERC-8004 identities, from their registrations on the gateway.
export const PROVIDERS: Record<string, { agentId: bigint; endpoint: string }> = {
  "x.posts.search": { agentId: 9895n, endpoint: `${GATEWAY}/v1/social/x/posts/search` },
  "cencori.v1.chat.completions": {
    agentId: 9904n,
    endpoint: `${GATEWAY}/cencori/v1/chat/completions`,
  },
};

// A paid call that went wrong still carries its settlement, so it can be accounted for.
export class PaidCallError extends Error {
  txHash: string | undefined;
  constructor(message: string, txHash: string | undefined) {
    super(message);
    this.txHash = txHash;
  }
}

export type Buyer = ReturnType<typeof createBuyer>;

type BuyerOptions = {
  account: LocalAccount;
  ledger: Ledger;
  // In 6-decimal dollars: 0.01 per call and 0.20 per day.
  maxPerCall?: bigint;
  dailyBudget?: bigint;
  readBalance?: (token: Address, owner: Address) => Promise<bigint>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function createBuyer({
  account,
  ledger,
  maxPerCall = 10_000n,
  dailyBudget = 200_000n,
  readBalance,
  fetchImpl = fetch,
  now = Date.now,
}: BuyerOptions) {
  // Pay with the first token the wallet holds enough of.
  async function pickToken() {
    if (!readBalance) return TOKENS[0];
    for (const symbol of TOKENS) {
      const token = tokenBySymbol("celo", symbol);
      if (token && (await readBalance(token.address, account.address)) >= maxPerCall) return symbol;
    }
    return TOKENS[0];
  }

  async function buy({ path, body }: Request) {
    let txHash: string | undefined;
    const response = await x402.payingFetch(
      {
        account,
        network: "celo",
        preferredToken: await pickToken(),
        fetchImpl,
        readBalance: readBalance && (({ token, owner }) => readBalance(token, owner)),
      },
      `${GATEWAY}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        maxAmount: maxPerCall,
        onBeforePayment: ({ maxAmountRequired }) => {
          const spent = ledger.spentSince(now() - DAY);
          if (spent + BigInt(maxAmountRequired) > dailyBudget) {
            throw new Error(`daily buy budget reached, ${spent} spent in the last 24h`);
          }
        },
        onPayment: (paid) => {
          txHash = paid.txHash;
          const { asset, amount, outcome } = paid;
          return ledger.record({ at: now(), path, asset, amount, txHash, outcome });
        },
        onAccountingError: (error) => console.error("buy: failed to record a purchase", error),
      },
    );
    if (!response.ok) throw new PaidCallError(`buy ${path} failed: ${response.status}`, txHash);
    return { data: await response.json(), txHash };
  }

  return {
    searchX: (query: string) => buy(xSearchRequest(query)),
    async chat(messages: Message[]) {
      const { data, txHash } = await buy(chatRequest(messages));
      const reply = data as { choices?: { message?: { content?: string } }[] };
      return { text: reply.choices?.[0]?.message?.content ?? "", txHash };
    },
  };
}

// The 402 challenge is free to fetch and is the authoritative price.
export async function quote({ path, body }: Request, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const envelope = response.status === 402 ? x402.parseEnvelope(await response.text()) : undefined;
  const requirement = envelope && x402.selectRequirements(envelope, "celo");
  if (!requirement) throw new Error(`no price for ${path} (status ${response.status})`);
  return BigInt(requirement.maxAmountRequired);
}
