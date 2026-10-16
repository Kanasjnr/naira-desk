import {
  type createTaggedWalletClient,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  reputationRegistryAbi,
  toDataUri,
} from "@naira-desk/chain";
import { type Call, PROVIDERS } from "@naira-desk/intel";
import { appendJsonl, CELO_CHAIN_ID, readJsonl } from "@naira-desk/shared";
import { type Address, type Hash, keccak256, type PublicClient, toBytes } from "viem";
import type { Decision } from "./modes.ts";

const DAY = 86_400_000;
const RETRY = 3_600_000;

export type Summary = {
  capability: string;
  from: number;
  calls: Call[];
  value: number;
  posts: number;
  informed: number;
  modeChanges: number;
};

export type Review = {
  at: number;
  capability: string;
  agentId: number;
  value: number;
  calls: number;
  txHash: string;
};

// Scores a provider on the share of its paid calls that delivered, and notes how many
// decisions its data fed and how many of those changed the quoting mode.
export function summarize(
  decisions: Decision[],
  capability: string,
  since: number,
  until: number,
): Summary | undefined {
  const calls: Call[] = [];
  let from: number | undefined;
  let informed = 0;
  let modeChanges = 0;
  let mode = decisions.findLast((d) => d.at <= since)?.mode;
  for (const decision of decisions) {
    if (decision.at <= since || decision.at > until) continue;
    const changed = mode !== undefined && mode !== decision.mode;
    mode = decision.mode;
    const paid = (decision.check.calls ?? []).filter(
      (call) => call.capability === capability && call.txHash,
    );
    if (paid.length === 0) continue;
    from ??= decision.at;
    calls.push(...paid);
    informed += 1;
    if (changed) modeChanges += 1;
  }
  if (from === undefined) return undefined;
  return {
    capability,
    from,
    calls,
    value: Math.round((100 * calls.filter((c) => c.ok).length) / calls.length),
    posts: calls.reduce((sum, c) => sum + (c.posts ?? 0), 0),
    informed,
    modeChanges,
  };
}

const iso = (at: number) => new Date(at).toISOString();

// The gateway's own feedback file, plus what the calls were used for.
export function feedbackFile(summary: Summary, client: Address, until: number) {
  const provider = PROVIDERS[summary.capability];
  if (!provider) throw new Error(`no provider identity for ${summary.capability}`);
  return {
    agentRegistry: `eip155:${CELO_CHAIN_ID}:${IDENTITY_REGISTRY}`,
    agentId: Number(provider.agentId),
    clientAddress: `eip155:${CELO_CHAIN_ID}:${client}`,
    createdAt: iso(until),
    value: summary.value,
    valueDecimals: 0,
    tag1: "successRate",
    tag2: summary.capability,
    endpoint: provider.endpoint,
    period: { from: iso(summary.from), to: iso(until) },
    calls: summary.calls.length,
    delivered: summary.calls.filter((c) => c.ok).length,
    ...(summary.posts > 0 && { postsDelivered: summary.posts }),
    decisionsInformed: summary.informed,
    modeChanges: summary.modeChanges,
    payments: summary.calls.map((c) => c.txHash),
  };
}

export type FeedbackFile = ReturnType<typeof feedbackFile>;

export const feedbackArgs = (file: FeedbackFile) =>
  [
    BigInt(file.agentId),
    BigInt(file.value),
    0,
    file.tag1,
    file.tag2,
    file.endpoint,
    toDataUri(file),
    keccak256(toBytes(JSON.stringify(file))),
  ] as const;

type Wallet = Pick<ReturnType<typeof createTaggedWalletClient>, "writeContract">;

export function feedbackPoster(
  wallet: Wallet,
  client: Pick<PublicClient, "waitForTransactionReceipt">,
) {
  return async (file: FeedbackFile) => {
    const hash = await wallet.writeContract({
      address: REPUTATION_REGISTRY,
      abi: reputationRegistryAbi,
      functionName: "giveFeedback",
      args: feedbackArgs(file),
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`feedback ${hash} reverted`);
    return hash;
  };
}

type ReviewerOptions = {
  client: Address;
  decisions: () => Decision[];
  give: (file: FeedbackFile) => Promise<Hash>;
  logPath: string;
  now?: () => number;
  every?: number;
};

// Once a day, reviews every provider the agent paid since that provider's last review.
// Each provider keeps its own clock, so a failed post can't duplicate the others.
export async function createReviewer({
  client,
  decisions,
  give,
  logPath,
  now = Date.now,
  every = DAY,
}: ReviewerOptions) {
  const reviews = await readJsonl<Review>(logPath);
  const lastAt = (capability: string) =>
    reviews.findLast((r) => r.capability === capability)?.at ?? 0;
  let nextAt = Math.max(0, ...reviews.map((r) => r.at)) + every;
  let running: Promise<void> | undefined;

  function pending(until = now()) {
    return Object.keys(PROVIDERS).flatMap((capability) => {
      const since = lastAt(capability);
      const summary = summarize(decisions(), capability, since, until);
      return summary ? [feedbackFile(summary, client, until)] : [];
    });
  }

  async function review() {
    const until = now();
    for (const file of pending(until)) {
      const txHash = await give(file);
      const entry = {
        at: until,
        capability: file.tag2,
        agentId: file.agentId,
        value: file.value,
        calls: file.calls,
        txHash,
      };
      reviews.push(entry);
      await appendJsonl(logPath, entry);
      console.log(
        `reviewed ${file.tag2} (agent #${file.agentId}): ${file.value}/100 over ${file.calls} calls, ${file.decisionsInformed} decisions [${txHash}]`,
      );
    }
  }

  return {
    history: () => reviews,
    pending,
    review,
    tick() {
      if (running || now() < nextAt) return running;
      running = review()
        .then(() => {
          nextAt = now() + every;
        })
        .catch((error) => {
          console.warn(`supplier review failed: ${error instanceof Error ? error.message : error}`);
          nextAt = now() + RETRY;
        })
        .finally(() => {
          running = undefined;
        });
      return running;
    },
  };
}
