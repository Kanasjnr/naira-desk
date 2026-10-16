import { type Buyer, chatRequest, PaidCallError, xSearchRequest } from "./buy.ts";

export type RiskLevel = "low" | "elevated" | "severe";
// Naira per US dollar, as quoted in the posts.
export type QuotedRates = { official?: number; parallel?: number };
// One paid call and whether it delivered what was paid for.
export type Call = { capability: string; txHash?: string; ok: boolean; posts?: number };
export type RiskCheck = {
  level: RiskLevel;
  reason: string;
  posts: number;
  calls: Call[];
  rates?: QuotedRates;
};

export const NEWS_QUERY =
  "(naira OR CBN) (dollar OR exchange OR rate OR devaluation) within_time:6h";
export const RATES_QUERY =
  'naira ("black market" OR parallel OR aboki OR BDC) (rate OR "dollar rate") within_time:1d';
const MAX_POSTS = 10;
const SEARCH = xSearchRequest("").capability;
const RATING = chatRequest([]).capability;

const INSTRUCTIONS = `You watch the news for a market maker that quotes the Nigerian naira (cNGN) against USDT.
You get two lists of recent posts, NEWS and RATES.
1. From all the posts, judge whether the naira exchange rate is likely to move sharply in the next few hours.
2. From the RATES posts, take the latest naira-per-US-dollar rates people quote: the official rate (CBN or NFEM) and the parallel rate (black market, BDC or street). Use null when the posts don't say.
Reply with JSON only: {"risk": "low" | "elevated" | "severe", "reason": "<one sentence>", "official": <number or null>, "parallel": <number or null>}.
severe: a devaluation, a new FX rule, a market halt or a panic happening now.
elevated: an imminent CBN decision, unusual volatility, or credible rumours of either.
low: routine commentary.`;

type Post = {
  type?: string;
  text?: string;
  created_at?: string;
  screen_name?: string;
  user_info?: { followers_count?: number };
};

const timelineOf = (search: unknown) =>
  (search as { output?: { timeline?: unknown } })?.output?.timeline;

export function postsFrom(search: unknown): Post[] {
  const timeline = timelineOf(search);
  if (!Array.isArray(timeline)) return [];
  return timeline.filter((post: Post) => post?.type === "tweet" && post.text);
}

const rate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

// The model is asked for bare JSON but may wrap it in prose or a code fence.
export function parseRisk(text: string): Pick<RiskCheck, "level" | "reason" | "rates"> | undefined {
  try {
    const { risk, reason, official, parallel } = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (["low", "elevated", "severe"].includes(risk) && typeof reason === "string") {
      return { level: risk, reason, rates: { official: rate(official), parallel: rate(parallel) } };
    }
  } catch {}
  return undefined;
}

const line = (post: Post, i: number) =>
  `${i + 1}. ${post.created_at} @${post.screen_name} (${post.user_info?.followers_count ?? 0} followers): ${post.text?.slice(0, 400)}`;

const failedCall = (capability: string, error: unknown): Call[] =>
  error instanceof PaidCallError ? [{ capability, txHash: error.txHash, ok: false }] : [];

// Buys recent naira news and street-rate posts, then pays Cencori to rate the risk and
// read off the quoted rates. Anything it can't read counts as elevated, so a failure
// makes the agent more careful, never less.
export async function checkNairaRisk(buyer: Buyer): Promise<RiskCheck> {
  const searches = await Promise.allSettled([
    buyer.searchX(NEWS_QUERY),
    buyer.searchX(RATES_QUERY),
  ]);
  const calls = searches.flatMap((search): Call[] =>
    search.status === "fulfilled"
      ? [
          {
            capability: SEARCH,
            txHash: search.value.txHash,
            ok: Array.isArray(timelineOf(search.value.data)),
            posts: postsFrom(search.value.data).length,
          },
        ]
      : failedCall(SEARCH, search.reason),
  );
  const [news, rates] = searches.map((search) =>
    search.status === "fulfilled" ? postsFrom(search.value.data).slice(0, MAX_POSTS) : [],
  ) as [Post[], Post[]];
  const failed = searches.find((search) => search.status === "rejected");
  if (failed && searches.every((search) => search.status === "rejected")) throw failed.reason;

  const posts = news.length + rates.length;
  if (posts === 0) return { level: "low", reason: "no recent posts", posts, calls };

  try {
    const answer = await buyer.chat([
      { role: "system", content: INSTRUCTIONS },
      {
        role: "user",
        content: `NEWS\n${news.map(line).join("\n") || "none"}\n\nRATES\n${rates.map(line).join("\n") || "none"}`,
      },
    ]);
    const risk = parseRisk(answer.text);
    calls.push({ capability: RATING, txHash: answer.txHash, ok: risk !== undefined });
    return {
      ...(risk ?? { level: "elevated", reason: "couldn't read the rating, staying careful" }),
      posts,
      calls,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    calls.push(...failedCall(RATING, error));
    return { level: "elevated", reason: `rating failed: ${message}`, posts, calls };
  }
}

export const receiptsOf = (check: Pick<RiskCheck, "calls">) =>
  (check.calls ?? []).flatMap((call) => (call.txHash ? [call.txHash] : []));
