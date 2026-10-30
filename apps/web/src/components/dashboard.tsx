"use client";

import { useEffect, useState } from "react";
import { clock } from "@/lib/format";
import type { Taker } from "@/lib/taker";
import type { Tape } from "@/lib/tape";
import type { Vault } from "@/lib/vault";
import { Reviews, Sales } from "./activity";
import { DecisionTape } from "./decision-tape";
import { EventTape } from "./event-tape";
import { Figures } from "./figures";
import { RatesChart } from "./rates-chart";
import { StatusCard } from "./status-card";
import { TakerSection } from "./taker";
import { Ticker } from "./ticker";
import { VaultSection } from "./vault";

const REFRESH_MS = 15_000;

// Keeps the last good response on screen while it refreshes, and says so if its source goes quiet.
function usePolled<T>(path: string, initial: T | null) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        setData((await response.json()) as T);
        setStale(false);
      } catch {
        setStale(true);
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [path]);

  return { data, stale };
}

export function Dashboard({
  initial,
}: {
  initial: { tape: Tape | null; vault: Vault | null; taker: Taker | null };
}) {
  const { data: tape, stale } = usePolled("/api/tape", initial.tape);
  const vault = usePolled("/api/vault", initial.vault);
  const taker = usePolled("/api/taker", initial.taker);

  const fade = (isStale: boolean) => `transition-opacity ${isStale ? "opacity-60" : ""}`;

  return (
    <div className="space-y-3">
      <div className={fade(stale)}>
        <Ticker tape={tape} vault={vault.data} taker={taker.data} stale={stale} />
      </div>
      {tape ? (
        <div className={`grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] ${fade(stale)}`}>
          <RatesChart tape={tape} />
          <div className="flex flex-col gap-3">
            <StatusCard tape={tape} />
            <EventTape tape={tape} vault={vault.data} taker={taker.data} />
          </div>
        </div>
      ) : (
        <p className="rounded-md border bg-card py-12 text-center font-mono text-xs text-muted-foreground">
          AGENT OFFLINE · its rates and decisions fill in once it's reachable
        </p>
      )}
      <Figures tape={tape} vault={vault.data} taker={taker.data} />
      <div className={fade(vault.stale)}>
        <VaultSection vault={vault.data} />
      </div>
      <div className={fade(taker.stale)}>
        <TakerSection
          taker={taker.data}
          tape={tape?.taker ?? null}
          now={taker.data?.fetchedAt ?? tape?.generatedAt ?? 0}
        />
      </div>
      {tape && (
        <div className={`space-y-3 ${fade(stale)}`}>
          <DecisionTape tape={tape} />
          <div className="grid gap-3 lg:grid-cols-2">
            <Reviews tape={tape} />
            <Sales tape={tape} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {stale ? "AGENT UNREACHABLE · showing the last update" : "UPDATED"}{" "}
            {clock(tape.generatedAt)} WAT · raw data at{" "}
            <a href="/api/tape" className="underline hover:text-signal">
              /api/tape
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
