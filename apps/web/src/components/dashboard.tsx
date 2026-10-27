"use client";

import { useEffect, useState } from "react";
import { clock } from "@/lib/format";
import type { Taker } from "@/lib/taker";
import type { Tape } from "@/lib/tape";
import type { Vault } from "@/lib/vault";
import { Reviews, Sales } from "./activity";
import { DecisionTape } from "./decision-tape";
import { Figures } from "./figures";
import { RatesChart } from "./rates-chart";
import { StatusCard } from "./status-card";
import { TakerSection } from "./taker";
import { VaultSection } from "./vault";

const REFRESH_MS = 30_000;

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

  return (
    <div className="space-y-4">
      {tape ? (
        <div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
          <StatusCard tape={tape} />
          <Figures tape={tape} />
        </div>
      ) : (
        <p className="py-12 text-center text-muted-foreground">
          The agent isn't reachable right now. Its rates and decisions fill in once it is.
        </p>
      )}
      <div className={`transition-opacity ${vault.stale ? "opacity-60" : ""}`}>
        <VaultSection vault={vault.data} />
      </div>
      <div className={`transition-opacity ${taker.stale ? "opacity-60" : ""}`}>
        <TakerSection
          taker={taker.data}
          tape={tape?.taker ?? null}
          now={taker.data?.fetchedAt ?? tape?.generatedAt ?? 0}
        />
      </div>
      {tape && (
        <div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
          <RatesChart tape={tape} />
          <DecisionTape tape={tape} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Reviews tape={tape} />
            <Sales tape={tape} />
          </div>
          <p className="text-xs text-muted-foreground">
            {stale ? "Can't reach the agent, showing the last update" : "Updated"} at{" "}
            {clock(tape.generatedAt)} WAT · raw data at{" "}
            <a href="/api/tape" className="underline">
              /api/tape
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
