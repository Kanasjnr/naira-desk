import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Call, RiskLevel } from "@naira-desk/intel";
import { readJsonl } from "@naira-desk/shared";
import { describe, expect, it, vi } from "vitest";
import type { Decision, Mode } from "./modes.ts";
import {
  createReviewer,
  type FeedbackFile,
  feedbackArgs,
  feedbackFile,
  summarize,
} from "./reviews.ts";

const HOUR = 3_600_000;
const SEARCH = "x.posts.search";
const RATING = "cencori.v1.chat.completions";
const agent = "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582";

const search = (txHash: string, posts: number, ok = true): Call => ({
  capability: SEARCH,
  txHash,
  ok,
  posts,
});
const rating = (txHash: string, ok = true): Call => ({ capability: RATING, txHash, ok });

const decision = (at: number, mode: Mode, calls: Call[], level: RiskLevel = "low"): Decision => ({
  at,
  trigger: "schedule",
  mode,
  check: { level, reason: "r", posts: 0, calls },
});

const day = [
  decision(1 * HOUR, "normal", [search("0xa1", 10), search("0xa2", 7), rating("0xb1")]),
  decision(7 * HOUR, "caution", [
    search("0xa3", 0, false),
    search("0xa4", 3),
    rating("0xb2", false),
  ]),
  decision(9 * HOUR, "normal", [search("0xa5", 9), search("0xa6", 4)]),
];

describe("summarize", () => {
  it("scores a provider on how many paid calls delivered", () => {
    expect(summarize(day, SEARCH, 0, 24 * HOUR)).toMatchObject({
      value: 83,
      posts: 33,
      informed: 3,
      modeChanges: 2,
    });
    expect(summarize(day, RATING, 0, 24 * HOUR)).toMatchObject({ value: 50, informed: 2 });
  });

  it("only looks inside the window and skips unpaid calls", () => {
    expect(summarize(day, RATING, 2 * HOUR, 24 * HOUR)?.calls).toEqual([rating("0xb2", false)]);
    const unpaid = [decision(HOUR, "normal", [{ capability: SEARCH, ok: false }])];
    expect(summarize(unpaid, SEARCH, 0, 24 * HOUR)).toBeUndefined();
  });

  it("counts a mode change against the decision before the window", () => {
    expect(summarize(day, SEARCH, 8 * HOUR, 24 * HOUR)?.modeChanges).toBe(1);
  });
});

describe("feedbackFile", () => {
  it("follows the gateway's feedback format and links every payment", async () => {
    const summary = summarize(day, SEARCH, 0, 24 * HOUR);
    if (!summary) throw new Error("no summary");
    const file = feedbackFile(summary, agent, 24 * HOUR);
    expect(file).toEqual({
      agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      agentId: 9895,
      clientAddress: `eip155:42220:${agent}`,
      createdAt: "1970-01-02T00:00:00.000Z",
      value: 83,
      valueDecimals: 0,
      tag1: "successRate",
      tag2: SEARCH,
      endpoint: "https://gateway.usebuy.ai/v1/social/x/posts/search",
      period: { from: "1970-01-01T01:00:00.000Z", to: "1970-01-02T00:00:00.000Z" },
      calls: 6,
      delivered: 5,
      postsDelivered: 33,
      decisionsInformed: 3,
      modeChanges: 2,
      payments: ["0xa1", "0xa2", "0xa3", "0xa4", "0xa5", "0xa6"],
    });

    const [agentId, value, decimals, tag1, tag2, endpoint, uri] = feedbackArgs(file);
    expect([agentId, value, decimals, tag1, tag2, endpoint]).toEqual([
      9895n,
      83n,
      0,
      "successRate",
      SEARCH,
      file.endpoint,
    ]);
    expect(await (await fetch(uri)).json()).toEqual(file);
  });
});

describe("createReviewer", () => {
  async function setup(give: (file: FeedbackFile) => Promise<`0x${string}`>) {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let clock = 24 * HOUR;
    const logPath = join(await mkdtemp(join(tmpdir(), "reviews-")), "reviews.jsonl");
    const decisions = [...day];
    const open = () =>
      createReviewer({
        client: agent,
        decisions: () => decisions,
        give,
        logPath,
        now: () => clock,
      });
    return { open, logPath, decisions, advance: (ms: number) => (clock += ms) };
  }

  it("reviews each provider once a day and remembers it across restarts", async () => {
    const give = vi.fn(async (_file: FeedbackFile) => "0xfeed" as const);
    const { open, logPath, advance } = await setup(give);
    const reviewer = await open();

    await reviewer.tick();
    expect(give.mock.calls.map(([file]) => [file.agentId, file.value])).toEqual([
      [9895, 83],
      [9904, 50],
    ]);
    expect(await readJsonl(logPath)).toHaveLength(2);

    advance(12 * HOUR);
    await (await open()).tick();
    expect(give).toHaveBeenCalledTimes(2);
  });

  it("only reviews what's new since the last review", async () => {
    const give = vi.fn(async (_file: FeedbackFile) => "0xfeed" as const);
    const { open, decisions, advance } = await setup(give);
    await (await open()).tick();

    decisions.push(decision(30 * HOUR, "normal", [search("0xa7", 5)]));
    advance(24 * HOUR);
    await (await open()).tick();
    expect(give.mock.calls.at(-1)?.[0]).toMatchObject({
      agentId: 9895,
      calls: 1,
      payments: ["0xa7"],
    });
    expect(give).toHaveBeenCalledTimes(3);
  });

  it("retries an hour after a failed post without repeating the ones that landed", async () => {
    const give = vi
      .fn<(file: FeedbackFile) => Promise<`0x${string}`>>()
      .mockResolvedValueOnce("0xfeed")
      .mockRejectedValueOnce(new Error("out of gas"))
      .mockResolvedValue("0xfeed");
    const { open, advance } = await setup(give);
    const reviewer = await open();

    await reviewer.tick();
    advance(30 * 60_000);
    await reviewer.tick();
    expect(give).toHaveBeenCalledTimes(2);

    advance(30 * 60_000);
    await reviewer.tick();
    expect(give.mock.calls.map(([file]) => file.agentId)).toEqual([9895, 9904, 9904]);
  });
});
