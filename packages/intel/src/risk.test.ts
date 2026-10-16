import { describe, expect, it } from "vitest";
import type { Buyer, Message } from "./buy.ts";
import { checkNairaRisk, parseRisk } from "./risk.ts";

const post = (text: string) => ({
  type: "tweet",
  text,
  created_at: "Thu Oct 15 09:52:35 +0000 2026",
  screen_name: "yebatech",
  user_info: { followers_count: 731 },
});

function fakeBuyer(posts: unknown[], reply: string | Error) {
  const asked: Message[][] = [];
  const buyer = {
    searchX: async () => ({ data: { output: { timeline: posts } }, txHash: "0xsearch" }),
    chat: async (messages: Message[]) => {
      asked.push(messages);
      if (reply instanceof Error) throw reply;
      return { text: reply, txHash: "0xchat" };
    },
  } as unknown as Buyer;
  return { buyer, asked };
}

describe("checkNairaRisk", () => {
  it("rates the posts it bought and keeps both receipts", async () => {
    const { buyer, asked } = fakeBuyer(
      [post("CBN announces naira devaluation")],
      '{"risk":"severe","reason":"devaluation announced"}',
    );

    expect(await checkNairaRisk(buyer)).toEqual({
      level: "severe",
      reason: "devaluation announced",
      posts: 1,
      receipts: ["0xsearch", "0xchat"],
    });
    expect(asked[0]?.[1]?.content).toContain(
      "@yebatech (731 followers): CBN announces naira devaluation",
    );
  });

  it("doesn't pay for a rating when there's nothing to rate", async () => {
    const { buyer, asked } = fakeBuyer([], "unused");

    expect(await checkNairaRisk(buyer)).toMatchObject({ level: "low", receipts: ["0xsearch"] });
    expect(asked).toHaveLength(0);
  });

  it("treats an unreadable or failed rating as elevated", async () => {
    const garbled = fakeBuyer([post("naira")], "I think it's fine");
    expect(await checkNairaRisk(garbled.buyer)).toMatchObject({ level: "elevated" });

    const failed = fakeBuyer([post("naira")], new Error("buy /cencori failed: 500"));
    expect(await checkNairaRisk(failed.buyer)).toMatchObject({
      level: "elevated",
      reason: "rating failed: buy /cencori failed: 500",
    });
  });
});

describe("parseRisk", () => {
  it("finds the JSON inside prose or a code fence", () => {
    expect(parseRisk('Sure:\n```json\n{"risk": "low", "reason": "routine"}\n```')).toEqual({
      level: "low",
      reason: "routine",
    });
    expect(parseRisk('{"risk": "panic", "reason": "x"}')).toBeUndefined();
  });
});
