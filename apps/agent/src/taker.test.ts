import { createTaggedWalletClient, REACTOR, TAKER, VAULT } from "@naira-desk/chain";
import { CNGN } from "@naira-desk/shared";
import { custom, hexToNumber, recoverMessageAddress, size, slice } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { FirmQuote } from "./rfq.ts";
import { poolQuoter, quoteProblem, takeGap, takerProof } from "./taker.ts";

describe("takerProof", () => {
  it("signs the Taker's own text and puts the nonce and issuedAt in front", async () => {
    const offline = custom({
      request: async () => {
        throw new Error("offline");
      },
    });
    const agent = createTaggedWalletClient(generatePrivateKey(), offline);
    const readContract = vi.fn(
      async ({ args }: { args: readonly [string, bigint] }) =>
        `Textile Taker Control for ${args[0]} at ${args[1]}`,
    );
    const client = { readContract, simulateContract: vi.fn() } as never;

    const proof = await takerProof(client, agent);
    const message = `Textile Taker Control for ${proof.nonce} at ${proof.issuedAt}`;

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: TAKER, functionName: "takerControl" }),
    );
    expect(size(proof.signature)).toBe(129);
    expect(slice(proof.signature, 0, 32)).toBe(proof.nonce);
    expect(hexToNumber(slice(proof.signature, 32, 64))).toBe(proof.issuedAt);
    const signer = await recoverMessageAddress({ message, signature: slice(proof.signature, 64) });
    expect(signer).toBe(agent.account.address);
    expect(proof.scheme).toBe("eip191");
  });
});

describe("poolQuoter", () => {
  const market = { name: "cNGN", token: CNGN, fee: 100 } as const;

  it("reads what the pool pays", async () => {
    const simulateContract = vi.fn(async () => ({ result: [4_499_053n, 0n, 0, 0n] }));
    const quote = poolQuoter({ readContract: vi.fn(), simulateContract } as never);
    expect(await quote(market, 6_154_188_697n)).toBe(4_499_053n);
  });

  it("reads a pool that can't fill the amount as paying nothing", async () => {
    const simulateContract = vi.fn(async () => {
      throw new Error("execution reverted: SPL");
    });
    const quote = poolQuoter({ readContract: vi.fn(), simulateContract } as never);
    expect(await quote(market, 6_154_188_697n)).toBe(0n);
  });
});

describe("takeGap", () => {
  const firmQuote = {
    status: "quoted",
    rfqId: "rfq_1",
    claimToken: "claim_1",
    quote: {
      sellAmount: "4456053",
      buyAmount: "6154188697",
      takerPays: "4456053",
      taker: TAKER,
      reactor: REACTOR,
      spender: REACTOR,
      orders: [{ maker: "0xe5036100B4A32B83D5E1997d403Ce64A4C7f7324" }],
    },
    transactions: { swap: { to: REACTOR, data: "0x0d7a16c3" } },
  };
  const gap = {
    market: { name: "cNGN", token: CNGN, fee: 100 },
    spend: 4_456_053n,
    bought: 6_154_188_697n,
    poolPays: 4_500_000n,
    profit: 43_947n,
  } as const;

  function setup(receiptStatus: "success" | "reverted", sendFails = false) {
    const paths: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      return new Response(JSON.stringify({ data: path.endsWith("/request") ? firmQuote : {} }));
    });
    const client = {
      readContract: vi.fn(async () => "Textile Taker Control"),
      simulateContract: vi.fn(async () => ({})),
      waitForTransactionReceipt: vi.fn(async () => ({ status: receiptStatus, logs: [] })),
    } as never;
    const wallet = {
      ...createTaggedWalletClient(generatePrivateKey(), custom({ request: async () => null })),
      writeContract: vi.fn(async () => {
        if (sendFails) throw new Error("nonce too low");
        return `0x${"ab".repeat(32)}` as const;
      }),
    } as never;
    return { paths, fetchFn, client, wallet };
  }

  it("cancels the firm quote when the take can't be sent", async () => {
    const { paths, fetchFn, client, wallet } = setup("success", true);
    await expect(takeGap({ client, wallet, fetchFn }, gap, 5_000_000n, 1n)).rejects.toThrow(
      "nonce too low",
    );
    expect(paths).toEqual(["/v2/rfq/request", "/v2/rfq/rfq_1/cancel"]);
  });

  it("cancels the firm quote when the take reverts", async () => {
    const { paths, fetchFn, client, wallet } = setup("reverted");
    await expect(takeGap({ client, wallet, fetchFn }, gap, 5_000_000n, 1n)).rejects.toThrow(
      "the take reverted",
    );
    expect(paths).toEqual(["/v2/rfq/request", "/v2/rfq/rfq_1/cancel"]);
  });
});

describe("quoteProblem", () => {
  const quoted = (changes: Partial<Extract<FirmQuote, { status: "quoted" }>["quote"]> = {}) =>
    ({
      status: "quoted",
      rfqId: "rfq_1",
      claimToken: "claim_1",
      quote: {
        sellAmount: "4456053",
        buyAmount: "6154188697",
        takerPays: "4456053",
        taker: TAKER,
        reactor: REACTOR,
        spender: REACTOR,
        orders: [{ maker: "0xe5036100B4A32B83D5E1997d403Ce64A4C7f7324" }],
        ...changes,
      },
      transactions: { swap: { to: REACTOR, data: "0x0d7a16c3" } },
    }) satisfies FirmQuote;

  it("passes a quote the Taker can fill", () => {
    expect(quoteProblem(quoted(), 5_000_000n)).toBeUndefined();
  });

  it("stops on no quote", () => {
    expect(quoteProblem({ status: "no_quote", reason: "no_valid_quote" }, 5_000_000n)).toBe(
      "no quote: no_valid_quote",
    );
  });

  it("stops on a quote made out to someone else", () => {
    const other = "0x497F12830607015Ed5ec9736afe43aaF8496512f";
    expect(quoteProblem(quoted({ taker: other }), 5_000_000n)).toContain("not the Taker");
  });

  // Yield-vault orders go through Textile's executor, and the Taker only calls the reactor.
  it("stops on a quote that settles anywhere but the reactor", () => {
    const executor = "0x1111111111111111111111111111111111111111";
    expect(quoteProblem(quoted({ spender: executor }), 5_000_000n)).toBe(
      "quote doesn't settle through the reactor",
    );
  });

  it("never takes from our own vault", () => {
    expect(quoteProblem(quoted({ orders: [{ maker: VAULT }] }), 5_000_000n)).toBe(
      "maker is our own vault",
    );
  });

  it("stops when the Taker can't pay", () => {
    expect(quoteProblem(quoted(), 4_456_052n)).toBe("quote needs 4456053, the Taker holds 4456052");
  });
});
