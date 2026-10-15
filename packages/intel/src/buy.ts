import { tokenBySymbol, x402 } from "@celo/buy-core";
import type { Address, LocalAccount } from "viem";
import type { Ledger } from "./ledger.ts";

export const GATEWAY = "https://gateway.usebuy.ai";
const X_SEARCH = "/v1/social/x/posts/search";
const DAY = 86_400_000;
// The gateway takes any of these. All are 6-decimal dollars, so spend adds up across them.
const TOKENS = ["USDC", "USDT", "USAT"] as const;

const xSearch = (query: string) => ({ query, type: "latest" });

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

  async function buy(path: string, body: unknown) {
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
        onPayment: ({ asset, amount, txHash, outcome }) =>
          ledger.record({ at: now(), path, asset, amount, txHash, outcome }),
        onAccountingError: (error) => console.error("buy: failed to record a purchase", error),
      },
    );
    if (!response.ok) throw new Error(`buy ${path} failed: ${response.status}`);
    return response.json();
  }

  return { searchX: (query: string) => buy(X_SEARCH, xSearch(query)) };
}

// The 402 challenge is free to fetch and is the authoritative price.
export async function quoteXSearch(query: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${GATEWAY}${X_SEARCH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(xSearch(query)),
  });
  const envelope = response.status === 402 ? x402.parseEnvelope(await response.text()) : undefined;
  const requirement = envelope && x402.selectRequirements(envelope, "celo");
  if (!requirement) throw new Error(`no price for X search (status ${response.status})`);
  return BigInt(requirement.maxAmountRequired);
}
