import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ago, when } from "@/lib/format";
import type { Tape } from "@/lib/tape";
import { ModeBadge } from "./mode-badge";
import { TxLink } from "./tx-link";

export function StatusCard({ tape }: { tape: Tape }) {
  const current = tape.current;
  const last = tape.decisions.at(-1);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Risk desk</CardTitle>
        {current && (
          <CardAction>
            <ModeBadge mode={current.mode} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {current ? (
          <>
            <p className="text-base leading-relaxed">{current.reason}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
              <dt className="text-muted-foreground">RISK</dt>
              <dd className="text-right uppercase">{current.level}</dd>
              <dt className="text-muted-foreground">CHECKED</dt>
              <dd className="text-right">{ago(current.checkedAt, tape.generatedAt)}</dd>
              <dt className="text-muted-foreground">
                {current.mode === "halted" && current.until ? "HALTED UNTIL" : "NEXT CHECK"}
              </dt>
              <dd className="text-right">
                {current.mode === "halted" && current.until
                  ? when(current.until)
                  : current.nextCheckAt > tape.generatedAt
                    ? ago(current.nextCheckAt, tape.generatedAt)
                    : "due"}
              </dd>
              {last && last.posts > 0 && (
                <>
                  <dt className="text-muted-foreground">READ</dt>
                  <dd className="text-right">{last.posts} paid posts</dd>
                </>
              )}
            </dl>
            {last && last.receipts.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                PAID
                {last.receipts.map((hash) => (
                  <TxLink key={hash} hash={hash} />
                ))}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            No risk check yet. The agent runs its first one when it starts.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
