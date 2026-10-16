import { x402 } from "@celo/buy-core";
import { createTaggedWalletClient } from "@naira-desk/chain";
import { type Address, custom, type Hash, type Hex, type PublicClient } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { type Authorization, createPaywall } from "./paywall.ts";

const payTo: Address = "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582";
const settlement: Hash = `0x${"5e".repeat(32)}`;
const offline = custom({
  request: async () => {
    throw new Error("no RPC in tests");
  },
});

function setup({ used = false, balance = 1_000_000n } = {}) {
  const payer = createTaggedWalletClient(generatePrivateKey(), offline).account;
  const settle = vi.fn(async (_asset: Address, _a: Authorization, _s: Hex) => settlement);
  const chain = {
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "authorizationState" ? used : balance,
  } as unknown as Pick<PublicClient, "readContract">;
  const paywall = createPaywall({
    price: 2_000n,
    payTo,
    resource: "http://127.0.0.1:8788/v1/naira",
    description: "Naira rates",
    chain,
    settle,
  });

  // Pays the way any buy client would, with buy-core's own signer.
  async function pay(symbol: string, change: (r: x402.PaymentRequirements) => object = (r) => r) {
    const requirements =
      paywall.accepts.find((r) => r.extra.name.includes(symbol)) ?? paywall.accepts[0];
    const payment = await x402.buildPayment({
      account: payer,
      requirements: change(requirements as x402.PaymentRequirements) as x402.PaymentRequirements,
      chainId: 42220,
      x402Version: 1,
    });
    return x402.encodePaymentHeader(payment);
  }
  return { paywall, payer, settle, pay };
}

describe("createPaywall", () => {
  it.each(["USDC", "Tether USD", "Tether America"])(
    "settles a %s payment signed by a buy client",
    async (name) => {
      const { paywall, payer, settle, pay } = setup();
      const charge = await paywall.charge(await pay(name));

      expect(charge).toEqual({
        ok: true,
        sale: {
          txHash: settlement,
          payer: payer.address,
          asset: paywall.accepts.find((r) => r.extra.name.includes(name))?.asset,
          amount: "2000",
        },
      });
      expect(settle.mock.calls[0]?.[1]).toMatchObject({
        from: payer.address,
        to: payTo,
        value: "2000",
      });
    },
  );

  it("won't take the same payment twice", async () => {
    const { paywall, pay } = setup();
    const header = await pay("Tether USD");
    expect((await paywall.charge(header)).ok).toBe(true);
    expect(await paywall.charge(header)).toEqual({ ok: false, error: "payment already used" });
  });

  it("refuses payments to someone else or for the wrong amount", async () => {
    const { paywall, settle, pay } = setup();
    const elsewhere = await pay("USDC", (r) => ({
      ...r,
      payTo: "0x000000000000000000000000000000000000dEaD",
    }));
    expect(await paywall.charge(elsewhere)).toEqual({ ok: false, error: "wrong recipient" });

    const cheap = await pay("USDC", (r) => ({ ...r, maxAmountRequired: "1000" }));
    expect(await paywall.charge(cheap)).toEqual({ ok: false, error: "wrong amount" });
    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses a nonce already spent onchain or a payer without the funds", async () => {
    const spent = setup({ used: true });
    expect(await spent.paywall.charge(await spent.pay("USDC"))).toEqual({
      ok: false,
      error: "payment already used",
    });

    const broke = setup({ balance: 0n });
    expect(await broke.paywall.charge(await broke.pay("USDC"))).toEqual({
      ok: false,
      error: "not enough USDC",
    });
  });

  it("rejects garbage and signatures for tokens it doesn't take", async () => {
    const { paywall, pay } = setup();
    expect(await paywall.charge("not base64 json")).toEqual({
      ok: false,
      error: "malformed payment header",
    });
    const foreign = await pay("USDC", (r) => ({
      ...r,
      asset: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      extra: { name: "Celo Dollar", version: "1" },
    }));
    expect(await paywall.charge(foreign)).toEqual({
      ok: false,
      error: "signature doesn't match an accepted token",
    });
  });

  it("frees the payment to retry if settlement fails", async () => {
    const { paywall, settle, pay } = setup();
    settle.mockRejectedValueOnce(new Error("nonce too low"));
    const header = await pay("USDC");

    expect(await paywall.charge(header)).toEqual({
      ok: false,
      error: "settlement failed: nonce too low",
    });
    expect((await paywall.charge(header)).ok).toBe(true);
  });
});
