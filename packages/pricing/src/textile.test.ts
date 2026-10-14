import { describe, expect, it } from "vitest";
import { textileMid } from "./textile.ts";

// Real preview responses from Celo, trimmed to the fields we read.
const buyCngn = { data: { status: "preview", rateRay: "733245000003518791314210" } };
const sellCngn = { data: { status: "preview", rateRay: "734141000003191751411613" } };

function fakeFetch(respond: (body: { sellToken: string }) => unknown): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(respond(body)));
  }) as typeof fetch;
}

describe("textileMid", () => {
  it("averages the buy and sell rates", async () => {
    const fetchFn = fakeFetch((body) => (body.sellToken.startsWith("0x4806") ? buyCngn : sellCngn));
    const { source, price } = await textileMid(fetchFn);
    expect(source).toBe("textile");
    expect(price).toBeCloseTo(0.000733693, 9);
  });

  it("throws when a side has no quote", async () => {
    const fetchFn = fakeFetch(() => ({ data: { status: "no_quote", reason: "no_makers_online" } }));
    await expect(textileMid(fetchFn)).rejects.toThrow(/no_makers_online/);
  });

  it("throws a clear error on an unexpected response", async () => {
    const fetchFn = fakeFetch(() => ({ error: "rate_limited" }));
    await expect(textileMid(fetchFn)).rejects.toThrow(/textile has no quote: unexpected response/);
  });
});
