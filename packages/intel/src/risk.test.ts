import { describe, expect, it } from "vitest";
import type { Buyer, Message } from "./buy.ts";
import { PaidCallError } from "./buy.ts";
import {
  checkNairaRisk,
  createRiskCheck,
  NEWS_QUERY,
  parseRisk,
  readPosts,
  receiptsOf,
} from "./risk.ts";

const post = (text: string) => ({
  type: "tweet",
  text,
  created_at: "Thu Oct 15 09:52:35 +0000 2026",
  screen_name: "yebatech",
  user_info: { followers_count: 731 },
});

type Feed = unknown[] | Error;

function fakeBuyer(news: Feed, rates: Feed, reply: string | Error) {
  const asked: Message[][] = [];
  const buyer = {
    searchX: async (query: string) => {
      const posts = query === NEWS_QUERY ? news : rates;
      if (posts instanceof Error) throw posts;
      const txHash = query === NEWS_QUERY ? "0xnews" : "0xrates";
      return { data: { output: { timeline: posts } }, txHash };
    },
    chat: async (messages: Message[]) => {
      asked.push(messages);
      if (reply instanceof Error) throw reply;
      return { text: reply, txHash: "0xchat" };
    },
  } as unknown as Buyer;
  return { buyer, asked };
}

describe("checkNairaRisk", () => {
  it("rates the news, reads the street rate, and keeps every receipt", async () => {
    const { buyer, asked } = fakeBuyer(
      [post("CBN announces naira devaluation")],
      [post("Black market dollar rate today: ₦1,420")],
      '{"risk":"severe","reason":"devaluation announced","official":1331,"parallel":1420}',
    );

    expect(await checkNairaRisk(buyer)).toEqual({
      level: "severe",
      reason: "devaluation announced",
      rates: { official: 1331, parallel: 1420 },
      posts: 2,
      calls: [
        { capability: "x.posts.search", txHash: "0xnews", ok: true, posts: 1 },
        { capability: "x.posts.search", txHash: "0xrates", ok: true, posts: 1 },
        { capability: "cencori.v1.chat.completions", txHash: "0xchat", ok: true },
      ],
    });
    const prompt = asked[0]?.[1]?.content;
    expect(prompt).toContain(
      "NEWS\n1. Thu Oct 15 09:52:35 +0000 2026 @yebatech (731 followers): CBN",
    );
    expect(prompt).toContain(
      "RATES\n1. Thu Oct 15 09:52:35 +0000 2026 @yebatech (731 followers): Black",
    );
  });

  it("doesn't pay for a rating when there's nothing to rate", async () => {
    const { buyer, asked } = fakeBuyer([], [], "unused");

    const check = await checkNairaRisk(buyer);
    expect(check.level).toBe("low");
    expect(receiptsOf(check)).toEqual(["0xnews", "0xrates"]);
    expect(asked).toHaveLength(0);
  });

  it("carries on with one search if the other fails", async () => {
    const { buyer, asked } = fakeBuyer(
      new Error("timeout"),
      [post("₦1,410 at the BDC")],
      '{"risk":"low","reason":"quiet","official":null,"parallel":1410}',
    );

    const check = await checkNairaRisk(buyer);
    expect(check.rates).toEqual({ parallel: 1410 });
    expect(receiptsOf(check)).toEqual(["0xrates", "0xchat"]);
    expect(asked[0]?.[1]?.content).toContain("NEWS\nnone");
  });

  it("throws when both searches fail", async () => {
    const { buyer } = fakeBuyer(new Error("budget"), new Error("budget"), "unused");
    await expect(checkNairaRisk(buyer)).rejects.toThrow("budget");
  });

  it("treats an unreadable or failed rating as elevated", async () => {
    const garbled = fakeBuyer([post("naira")], [], "I think it's fine");
    expect(await checkNairaRisk(garbled.buyer)).toMatchObject({
      level: "elevated",
      unreadable: "I think it's fine",
    });

    const failed = fakeBuyer(
      [post("naira")],
      [],
      new PaidCallError("buy /cencori failed: 500", "0xpaid"),
    );
    const check = await checkNairaRisk(failed.buyer);
    expect(check).toMatchObject({
      level: "elevated",
      reason: "rating failed: buy /cencori failed: 500",
      ratingFailed: true,
    });
    expect(check.calls.at(-1)).toEqual({
      capability: "cencori.v1.chat.completions",
      txHash: "0xpaid",
      ok: false,
    });
  });

  it("reads the posts itself instead of paying for a rating", async () => {
    const { buyer, asked } = fakeBuyer([post("naira steady")], [post("BDC rate ₦1,420")], "{}");
    expect(await checkNairaRisk(buyer, { rate: false })).toEqual({
      level: "low",
      reason: "AI read paused; no warning signs in 2 posts",
      posts: 2,
      calls: [
        { capability: "x.posts.search", txHash: "0xnews", ok: true, posts: 1 },
        { capability: "x.posts.search", txHash: "0xrates", ok: true, posts: 1 },
      ],
    });
    expect(asked).toEqual([]);
  });
});

describe("readPosts", () => {
  it("is careful when a post mentions a warning sign, and never halts on words alone", () => {
    expect(readPosts([post("routine"), post("CBN to Devalue the naira, sources say")])).toEqual({
      level: "elevated",
      reason: "AI read paused; 1 of 2 posts mention devalu",
    });
    expect(readPosts([post("markets suspended, panic at the BDCs")]).level).toBe("elevated");
  });

  it("calls routine posts low", () => {
    expect(readPosts([post("naira closes at ₦1,378 today")])).toEqual({
      level: "low",
      reason: "AI read paused; no warning signs in 1 post",
    });
  });
});

describe("createRiskCheck", () => {
  it("stops paying Cencori for 12 hours after it fails, then tries again", async () => {
    const { buyer, asked } = fakeBuyer(
      [post("naira")],
      [],
      new PaidCallError("buy /cencori failed: 400", "0xpaid"),
    );
    let clock = 0;
    const check = createRiskCheck(buyer, () => clock);

    expect((await check()).reason).toBe("rating failed: buy /cencori failed: 400");
    clock += 2 * 60 * 60_000;
    expect((await check()).reason).toBe("AI read paused; no warning signs in 1 post");
    expect(asked).toHaveLength(1);
    clock += 10 * 60 * 60_000;
    await check();
    expect(asked).toHaveLength(2);
  });

  it("keeps asking when Cencori answers, even unreadably", async () => {
    const { buyer, asked } = fakeBuyer([post("naira")], [], "I think it's fine");
    const check = createRiskCheck(buyer, () => 0);
    await check();
    await check();
    expect(asked).toHaveLength(2);
  });
});

describe("parseRisk", () => {
  it("finds the JSON inside prose or a code fence", () => {
    expect(parseRisk('Sure:\n```json\n{"risk": "low", "reason": "routine"}\n```')).toEqual({
      level: "low",
      reason: "routine",
      rates: {},
    });
    expect(parseRisk('{"risk": "panic", "reason": "x"}')).toBeUndefined();
  });

  it("reads naira amounts written with separators or as strings", () => {
    expect(
      parseRisk('{"risk":"low","reason":"r","official":1,331.61,"parallel":"₦1,375"}')?.rates,
    ).toEqual({ official: 1331.61, parallel: 1375 });
  });

  it("drops rates that aren't positive amounts", () => {
    const parsed = parseRisk('{"risk":"low","reason":"r","official":"n/a","parallel":-5}');
    expect(parsed?.rates).toEqual({ official: undefined, parallel: undefined });
  });
});
