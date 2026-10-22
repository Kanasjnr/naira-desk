import { Card, CardContent } from "@/components/ui/card";
import { ago, when } from "@/lib/format";
import type { Tape } from "@/lib/tape";
import { ModeBadge } from "./mode-badge";

export function StatusCard({ tape }: { tape: Tape }) {
  const current = tape.current;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {current ? (
          <>
            <ModeBadge mode={current.mode} />
            <p className="min-w-0 flex-1 basis-80 text-muted-foreground">{current.reason}</p>
            <p className="text-sm text-muted-foreground">
              {current.mode === "halted" && current.until
                ? `Halted until ${when(current.until)}`
                : `Checked ${ago(current.checkedAt, tape.generatedAt)} · next check ${
                    current.nextCheckAt > tape.generatedAt
                      ? ago(current.nextCheckAt, tape.generatedAt)
                      : "due"
                  }`}
            </p>
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
