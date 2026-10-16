import type { Buyer } from "./buy.ts";

export type RiskLevel = "low" | "elevated" | "severe";
export type RiskCheck = { level: RiskLevel; reason: string; posts: number; receipts: string[] };

export const NEWS_QUERY =
  "(naira OR CBN) (dollar OR exchange OR rate OR devaluation) within_time:6h";
const MAX_POSTS = 10;

const INSTRUCTIONS = `You watch the news for a market maker that quotes the Nigerian naira (cNGN) against USDT.
From the posts, judge whether the naira exchange rate is likely to move sharply in the next few hours.
Reply with JSON only: {"risk": "low" | "elevated" | "severe", "reason": "<one sentence>"}.
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

export function postsFrom(search: unknown): Post[] {
  const timeline = (search as { output?: { timeline?: unknown } })?.output?.timeline;
  if (!Array.isArray(timeline)) return [];
  return timeline.filter((post: Post) => post?.type === "tweet" && post.text);
}

// The model is asked for bare JSON but may wrap it in prose or a code fence.
export function parseRisk(text: string): Pick<RiskCheck, "level" | "reason"> | undefined {
  try {
    const { risk, reason } = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (["low", "elevated", "severe"].includes(risk) && typeof reason === "string") {
      return { level: risk, reason };
    }
  } catch {}
  return undefined;
}

const line = (post: Post, i: number) =>
  `${i + 1}. ${post.created_at} @${post.screen_name} (${post.user_info?.followers_count ?? 0} followers): ${post.text?.slice(0, 400)}`;

// Buys recent naira posts, then pays Cencori to rate them. Anything it can't read counts
// as elevated, so a failure makes the agent more careful, never less.
export async function checkNairaRisk(buyer: Buyer): Promise<RiskCheck> {
  const search = await buyer.searchX(NEWS_QUERY);
  const posts = postsFrom(search.data).slice(0, MAX_POSTS);
  const receipts = [search.txHash].filter((hash) => hash !== undefined);
  if (posts.length === 0) return { level: "low", reason: "no recent posts", posts: 0, receipts };

  try {
    const answer = await buyer.chat([
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: posts.map(line).join("\n") },
    ]);
    if (answer.txHash) receipts.push(answer.txHash);
    const risk = parseRisk(answer.text) ?? {
      level: "elevated",
      reason: "couldn't read the rating, staying careful",
    };
    return { ...risk, posts: posts.length, receipts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      level: "elevated",
      reason: `rating failed: ${message}`,
      posts: posts.length,
      receipts,
    };
  }
}
