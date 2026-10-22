"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ago, nairaShort, when } from "@/lib/format";
import type { Decision, Tape } from "@/lib/tape";
import { ModeBadge } from "./mode-badge";
import { TxLink } from "./tx-link";

const SHOWN = 10;

function rates(d: Decision) {
  const street = d.street;
  if (!street) return null;
  return [
    street.onchain && `onchain ${nairaShort(street.onchain)}`,
    street.official && `official ${nairaShort(street.official)}`,
    street.parallel && `parallel ${nairaShort(street.parallel)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DecisionTape({ tape }: { tape: Tape }) {
  const [all, setAll] = useState(false);
  const decisions = [...tape.decisions].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision tape</CardTitle>
        <CardDescription>
          Each risk check the agent paid for, newest first. Every payment links to Celoscan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risk checks yet.</p>
        ) : (
          <ol className="divide-y">
            {decisions.slice(0, all ? decisions.length : SHOWN).map((d) => (
              <li key={d.at} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[9rem_1fr]">
                <div className="text-sm text-muted-foreground">
                  {when(d.at)}
                  <span className="block text-xs">{ago(d.at, tape.generatedAt)}</span>
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ModeBadge mode={d.mode} />
                    <span className="text-sm text-muted-foreground">
                      after {d.trigger}
                      {d.detail ? ` (${d.detail})` : ""} · risk {d.level}
                    </span>
                  </div>
                  <p>{d.reason}</p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {d.posts > 0 && <span>{d.posts} posts read</span>}
                    {rates(d) && <span>{rates(d)}</span>}
                    {d.receipts.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        paid
                        {d.receipts.map((hash) => (
                          <TxLink key={hash} hash={hash} />
                        ))}
                      </span>
                    ) : (
                      <span>nothing paid</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {decisions.length > SHOWN && (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${decisions.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
