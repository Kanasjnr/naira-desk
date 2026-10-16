import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { x402 } from "@celo/buy-core";
import { createTaggedWalletClient } from "@naira-desk/chain";
import type { FairValue } from "@naira-desk/pricing";
import { custom, type Hash, type PublicClient } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiServer, PROOF_PATH, QUOTE_PATH, TAPE_PATH } from "./api.ts";
import type { Decision } from "./modes.ts";
import { createPaywall } from "./paywall.ts";
import { nairaQuote } from "./quote.ts";

const offline = custom({
  request: async () => {
    throw new Error("no RPC in tests");
  },
});
const settlement: Hash = `0x${"5e".repeat(32)}`;
const fair: FairValue = {
  ok: true,
  price: 1 / 1361.2,
  at: 1_792_150_000_000,
  sources: ["textile", "uniswap"],
};
const decision: Decision = {
  at: 1_792_149_189_256,
  trigger: "startup",
  mode: "normal",
  check: {
    level: "low",
    reason: "routine commentary",
    posts: 17,
    calls: [{ capability: "x.posts.search", txHash: "0xa1", ok: true }],
    street: { onchain: 1361.2, official: 1331.61, parallel: 1375, offBandPct: 0 },
  },
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    }),
  );
});

async function serve(value: FairValue) {
  const seller = createTaggedWalletClient(generatePrivateKey(), offline).account;
  const settle = vi.fn(async () => settlement);
  const chain = {
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "authorizationState" ? false : 1_000_000n,
  } as unknown as Pick<PublicClient, "readContract">;
  const sales: unknown[] = [];
  const server = createApiServer({
    quote: () => nairaQuote(value, decision),
    tape: () => ({ decisions: [decision] }),
    page: "<!doctype html><title>Naira Desk · proof</title>",
    paywall: createPaywall({
      price: 2_000n,
      payTo: seller.address,
      resource: "http://127.0.0.1/v1/naira",
      description: "Naira rates",
      chain,
      settle,
    }),
    onSale: (sale) => sales.push(sale),
  }).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, settle, sales };
}

describe("createApiServer", () => {
  it("sells a quote to a buy client for $0.002", async () => {
    const { url, settle, sales } = await serve(fair);
    const buyer = createTaggedWalletClient(generatePrivateKey(), offline).account;

    const response = await x402.payingFetch(
      { account: buyer, network: "celo" },
      `${url}${QUOTE_PATH}`,
      {
        maxAmount: 2_000n,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pair: "NGN/USD",
      onchain: { ngnPerUsdt: 1361.2, sources: ["textile", "uniswap"] },
      street: { official: 1331.61, parallel: 1375, onchainOffBandPct: 0 },
      risk: { mode: "normal", level: "low", evidence: ["0xa1"] },
      agent: { agentId: 9908 },
    });
    const receipt = x402.decodePaymentResponseHeader(
      response.headers.get("x-payment-response") ?? "",
    );
    expect(receipt).toMatchObject({ success: true, transaction: settlement, payer: buyer.address });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(sales).toHaveLength(1);
  });

  it("quotes the price for free and explains a refused payment", async () => {
    const { url } = await serve(fair);
    const challenge = await fetch(`${url}${QUOTE_PATH}`);
    expect(challenge.status).toBe(402);
    const { accepts } = (await challenge.json()) as { accepts: unknown[] };
    expect(accepts).toHaveLength(3);

    const refused = await fetch(`${url}${QUOTE_PATH}`, { headers: { "x-payment": "nonsense" } });
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({ error: "malformed payment header" });
  });

  it("never charges when it has no trustworthy rate", async () => {
    const { url, settle } = await serve({ ok: false, reason: "sources disagree" });
    const response = await fetch(`${url}${QUOTE_PATH}`, { headers: { "x-payment": "anything" } });
    expect(response.status).toBe(503);
    expect(settle).not.toHaveBeenCalled();
  });

  it("serves the tape and the proof page for free", async () => {
    const { url } = await serve(fair);
    expect(await (await fetch(`${url}${TAPE_PATH}`)).json()).toMatchObject({
      decisions: [{ mode: "normal" }],
    });
    const page = await fetch(`${url}${PROOF_PATH}`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Naira Desk · proof");
  });

  it("describes itself at the root", async () => {
    const { url } = await serve(fair);
    expect(await (await fetch(url)).json()).toMatchObject({
      name: "Naira Desk",
      endpoints: [
        { path: QUOTE_PATH, price: "2000" },
        { path: TAPE_PATH, price: "0" },
        { path: PROOF_PATH, price: "0" },
      ],
    });
  });
});
