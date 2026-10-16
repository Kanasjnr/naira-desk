import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaggedWalletClient } from "@naira-desk/chain";
import { type Address, custom, type Hex, verifyTypedData } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createBuyer, quoteXSearch } from "./buy.ts";
import { openLedger } from "./ledger.ts";

const payTo = "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B";
const settlement = `0x${"ab".repeat(32)}`;

// The three tokens the gateway accepts, with their EIP-712 domains.
const tokens = [
  {
    symbol: "USDC",
    asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    name: "USDC",
    version: "2",
  },
  {
    symbol: "USDT",
    asset: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    name: "Tether USD",
    version: "1",
  },
  {
    symbol: "USAT",
    asset: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
    name: "Tether America USD",
    version: "1",
  },
] as const;

// Trimmed from the gateway's real 402 for an X search.
const challenge = (price: string) => ({
  x402Version: 1,
  accepts: tokens.map(({ asset, name, version }) => ({
    scheme: "exact",
    network: "celo",
    maxAmountRequired: price,
    resource: "https://gateway.usebuy.ai/v1/social/x/posts/search",
    description: "Search X posts through buy-gateway",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset,
    extra: { name, version },
  })),
  error: "",
});

const base64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function fakeGateway(price = "5000") {
  const payments: Array<{ payload: { signature: Hex; authorization: Record<string, string> } }> =
    [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const header = new Headers(init.headers).get("x-payment");
    if (!header) return Response.json(challenge(price), { status: 402 });
    payments.push(JSON.parse(Buffer.from(header, "base64").toString()));
    return Response.json(
      { data: [{ text: "CBN holds rates" }] },
      { headers: { "x-payment-response": base64({ success: true, transaction: settlement }) } },
    );
  }) as typeof fetch;
  return { fetchImpl, payments };
}

async function setup({ price, funded }: { price?: string; funded?: Address } = {}) {
  const offline = custom({
    request: async () => {
      throw new Error("no RPC in tests");
    },
  });
  const { account } = createTaggedWalletClient(generatePrivateKey(), offline);
  const ledger = await openLedger(join(await mkdtemp(join(tmpdir(), "buy-")), "purchases.jsonl"));
  const gateway = fakeGateway(price);
  const buyer = createBuyer({
    account,
    ledger,
    fetchImpl: gateway.fetchImpl,
    readBalance: funded && (async (token) => (token === funded ? 1_000_000n : 0n)),
  });
  return { account, ledger, buyer, ...gateway };
}

describe("createBuyer", () => {
  it.each(tokens)("pays in $symbol when that's what the agent holds", async (token) => {
    const { account, ledger, buyer, payments } = await setup({ funded: token.asset });

    expect(await buyer.searchX("naira CBN")).toEqual({ data: [{ text: "CBN holds rates" }] });

    const [payment] = payments;
    if (!payment) throw new Error("no payment sent");
    const { authorization, signature } = payment.payload;
    expect(authorization).toMatchObject({ from: account.address, to: payTo, value: "5000" });
    const valid = await verifyTypedData({
      address: account.address,
      domain: {
        name: token.name,
        version: token.version,
        chainId: 42220,
        verifyingContract: token.asset,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from as Hex,
        to: authorization.to as Hex,
        value: BigInt(authorization.value as string),
        validAfter: BigInt(authorization.validAfter as string),
        validBefore: BigInt(authorization.validBefore as string),
        nonce: authorization.nonce as Hex,
      },
      signature,
    });
    expect(valid).toBe(true);
    expect(ledger.last()).toMatchObject({
      asset: token.asset,
      amount: "5000",
      txHash: settlement,
      outcome: "confirmed",
    });
  });

  it("won't pay more than the per-call cap", async () => {
    const { buyer, payments } = await setup({ price: "20000" });
    await expect(buyer.searchX("naira")).rejects.toThrow();
    expect(payments).toHaveLength(0);
  });

  it("stops paying once the daily budget is spent", async () => {
    const { ledger, buyer, payments } = await setup();
    await ledger.record({
      at: Date.now(),
      path: "/x",
      asset: tokens[0].asset,
      amount: "198000",
      outcome: "confirmed",
    });

    await expect(buyer.searchX("naira")).rejects.toThrow(/daily buy budget/);
    expect(payments).toHaveLength(0);
  });
});

describe("quoteXSearch", () => {
  it("reads the price from the 402 without paying", async () => {
    const { fetchImpl, payments } = fakeGateway();
    expect(await quoteXSearch("naira", fetchImpl)).toBe(5000n);
    expect(payments).toHaveLength(0);
  });
});
