import { TAKER } from "@naira-desk/chain";
import { CNGN, USDT } from "@naira-desk/shared";
import { describe, expect, it, vi } from "vitest";
import {
  cancelQuote,
  InsufficientFunds,
  reportFill,
  requestQuote,
  rfqLadders,
  type TakerProof,
} from "./rfq.ts";

const answer = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

const proof: TakerProof = { nonce: "0x01", issuedAt: 1, signature: "0x02", scheme: "eip191" };

describe("rfqLadders", () => {
  it("reads every pair on Celo", async () => {
    const fetchFn = answer(200, { data: { pairs: [{ sellToken: USDT }] } });
    expect(await rfqLadders(fetchFn)).toEqual([{ sellToken: USDT }]);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://api.textilecredit.com/v2/rfq/levels?chainId=42220",
    );
  });
});

describe("requestQuote", () => {
  it("asks for a firm quote made out to the Taker", async () => {
    const fetchFn = answer(200, { data: { status: "no_quote", reason: "no_makers_online" } });
    const quote = await requestQuote(
      { sellToken: USDT, buyToken: CNGN, sellAmount: 5_000_000n, taker: TAKER },
      proof,
      fetchFn,
    );
    expect(quote).toEqual({ status: "no_quote", reason: "no_makers_online" });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      chainId: 42220,
      sellToken: USDT,
      buyToken: CNGN,
      sellAmount: "5000000",
      taker: TAKER,
      takerProof: proof,
    });
  });

  it("names Textile's reason when it refuses", async () => {
    const fetchFn = answer(400, {
      error: {
        message: "Your wallet does not hold enough",
        details: { reason: "insufficient_funds" },
      },
    });
    await expect(
      requestQuote(
        { sellToken: USDT, buyToken: CNGN, sellAmount: 5_000_000n, taker: TAKER },
        proof,
        fetchFn,
      ),
    ).rejects.toThrow("textile /rfq/request: insufficient_funds");
  });

  it("keeps how much of the float Textile says is free", async () => {
    const fetchFn = answer(400, {
      error: {
        details: {
          reason: "insufficient_funds",
          required: "21936830",
          available: "21936830",
          committed: "1936830",
        },
      },
    });
    const refused = await requestQuote(
      { sellToken: USDT, buyToken: CNGN, sellAmount: 21_936_830n, taker: TAKER },
      proof,
      fetchFn,
    ).catch((error) => error);
    expect(refused).toBeInstanceOf(InsufficientFunds);
    expect(refused.free).toBe(20_000_000n);
    expect(refused.message).toBe(
      "textile /rfq/request: insufficient_funds (required 21936830, available 21936830, committed 1936830)",
    );
  });
});

describe("cancelQuote and reportFill", () => {
  it("prove they own the quote with its claim token", async () => {
    const fetchFn = answer(200, { data: { status: "submitted" } });
    await cancelQuote("rfq_1", "claim_1", fetchFn);
    await reportFill("rfq_1", "claim_1", `0x${"ab".repeat(32)}`, fetchFn);

    const [cancel, submit] = fetchFn.mock.calls;
    expect(String(cancel?.[0])).toBe("https://api.textilecredit.com/v2/rfq/rfq_1/cancel");
    expect(String(submit?.[0])).toBe("https://api.textilecredit.com/v2/rfq/rfq_1/submit");
    expect(new Headers(submit?.[1]?.headers).get("x-rfq-claim")).toBe("claim_1");
    expect(JSON.parse(String(submit?.[1]?.body))).toEqual({ txHash: `0x${"ab".repeat(32)}` });
  });
});
