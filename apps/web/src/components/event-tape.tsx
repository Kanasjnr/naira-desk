import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { celoscan, dollars, isTx, short } from "@/lib/format";
import type { Taker } from "@/lib/taker";
import type { Tape } from "@/lib/tape";
import type { Vault } from "@/lib/vault";

type Event = { at: number; tag: string; text: string; tx?: string; lit?: boolean };

const SHOWN = 12;

const stamp = (at: number) =>
  new Date(at).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Everything the desk did, newest first, from the agent's logs and the chain.
function events(tape: Tape | null, vault: Vault | null, taker: Taker | null): Event[] {
  return [
    ...(taker?.takes ?? []).map((t) => ({
      at: t.at,
      tag: "TAKE",
      text: `${t.market} ${dollars(t.spent)} → ${dollars(t.received)} +${dollars(t.profit)}`,
      tx: t.tx,
      lit: true,
    })),
    ...(tape?.taker?.misses ?? []).map((m) => ({
      at: m.at,
      tag: "MISS",
      text: `${m.market} ${dollars(m.spendUsd)} · ${m.reason}`,
    })),
    ...(vault?.fills ?? []).map((f) => ({
      at: f.at,
      tag: "FILL",
      text: `vault ${f.side === "buy" ? "bought" : "sold"} naira · ${dollars(f.usdt)}`,
      tx: f.tx,
      lit: !f.ours,
    })),
    ...(tape?.decisions ?? []).map((d) => ({
      at: d.at,
      tag: "CHECK",
      text: `${d.mode} after ${d.trigger}${d.detail ? ` (${d.detail})` : ""}`,
      tx: d.receipts[0],
    })),
    ...(tape?.sales.recent ?? []).map((s) => ({
      at: s.at,
      tag: "SALE",
      text: `quote to ${s.ours ? "our demo buyer" : short(s.payer)} · ${dollars(Number(s.amount) / 1e6)}`,
      tx: s.txHash,
      lit: !s.ours,
    })),
    ...(tape?.reviews ?? []).map((r) => ({
      at: r.at,
      tag: "REVIEW",
      text: `#${r.agentId} scored ${r.value}/100`,
      tx: r.txHash,
    })),
  ].sort((a, b) => b.at - a.at);
}

export function EventTape({
  tape,
  vault,
  taker,
}: {
  tape: Tape | null;
  vault: Vault | null;
  taker: Taker | null;
}) {
  const all = events(tape, vault, taker);
  return (
    <Card size="sm" className="min-h-0 flex-1">
      <CardHeader>
        <CardTitle>Tape</CardTitle>
        <CardAction className="font-mono text-xs text-muted-foreground">
          {all.length} events
        </CardAction>
      </CardHeader>
      <CardContent>
        {all.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Trades, checks and sales land here.</p>
        ) : (
          <ol className="space-y-1 font-mono text-xs tabular-nums">
            {all.slice(0, SHOWN).map((e) => (
              <li key={`${e.tag}-${e.at}-${e.tx ?? e.text}`} className="flex items-baseline gap-2">
                <span className="shrink-0 text-muted-foreground">{stamp(e.at)}</span>
                {e.tx && isTx(e.tx) ? (
                  <a
                    href={celoscan("tx", e.tx)}
                    target="_blank"
                    rel="noreferrer"
                    title="View on Celoscan"
                    className={`w-14 shrink-0 font-semibold underline-offset-4 hover:underline ${e.lit ? "text-signal" : "text-foreground"}`}
                  >
                    {e.tag}
                  </a>
                ) : (
                  <span className="w-14 shrink-0 font-semibold text-foreground">{e.tag}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={e.text}>
                  {e.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
