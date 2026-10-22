"use client";

import { useEffect, useState } from "react";
import { clock } from "@/lib/format";
import type { Tape } from "@/lib/tape";
import { Reviews, Sales } from "./activity";
import { DecisionTape } from "./decision-tape";
import { Figures } from "./figures";
import { RatesChart } from "./rates-chart";
import { StatusCard } from "./status-card";

const REFRESH_MS = 30_000;

// Keeps the last good tape on screen while it refreshes, and says so if the agent goes quiet.
export function Dashboard({ initial }: { initial: Tape | null }) {
  const [tape, setTape] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/tape", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        setTape((await response.json()) as Tape);
        setStale(false);
      } catch {
        setStale(true);
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!tape) {
    return (
      <p className="py-24 text-center text-muted-foreground">
        The agent isn't reachable right now. This page fills in once it is.
      </p>
    );
  }

  return (
    <div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
      <StatusCard tape={tape} />
      <Figures tape={tape} />
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
  );
}
