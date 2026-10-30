"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ago, clock, day, naira, nairaShort, when } from "@/lib/format";
import type { Tape } from "@/lib/tape";

const config = {
  onchain: { label: "Onchain cNGN", color: "var(--series-onchain)" },
  official: { label: "Official (CBN)", color: "var(--series-official)" },
  parallel: { label: "Parallel (street)", color: "var(--series-parallel)" },
} satisfies ChartConfig;

type Row = { at: number; onchain?: number; official?: number; parallel?: number };

function rowsFrom(tape: Tape): Row[] {
  const rows = new Map<number, Row>();
  const row = (at: number) => rows.get(at) ?? rows.set(at, { at }).get(at) ?? { at };
  for (const sample of tape.rates) row(sample.at).onchain = sample.ngnPerUsdt;
  for (const d of tape.decisions) {
    if (d.street?.official) row(d.at).official = d.street.official;
    if (d.street?.parallel) row(d.at).parallel = d.street.parallel;
    if (!tape.rates.length && d.street?.onchain) row(d.at).onchain = d.street.onchain;
  }
  return [...rows.values()].sort((a, b) => a.at - b.at);
}

const HOUR = 3_600_000;
// Lagos is UTC+1 all year, so its midnights sit an hour before UTC's.
const LAGOS_OFFSET = HOUR;

// Ticks on Lagos midnights for a multi-day view, otherwise every few hours.
export function timeTicks(from: number, to: number) {
  const span = to - from;
  const step = span > 36 * HOUR ? 24 * HOUR : span > 12 * HOUR ? 6 * HOUR : 2 * HOUR;
  const ticks = [];
  for (let t = Math.ceil((from + LAGOS_OFFSET) / step) * step - LAGOS_OFFSET; t <= to; t += step) {
    ticks.push(t);
  }
  return { ticks, daily: step >= 24 * HOUR };
}

// Spans where the agent was careful or had stopped quoting, shaded behind the rates.
function modeSpans(tape: Tape) {
  return tape.decisions.flatMap((d, i) => {
    if (d.mode === "normal") return [];
    const end = tape.decisions[i + 1]?.at ?? tape.generatedAt;
    return [{ from: d.at, to: end, mode: d.mode }];
  });
}

function latestOnchain(tape: Tape) {
  const sample = tape.rates.at(-1);
  if (sample) return { value: sample.ngnPerUsdt, at: sample.at };
  const street = tape.current?.street;
  return street?.onchain && tape.current
    ? { value: street.onchain, at: tape.current.checkedAt }
    : null;
}

function Headline({ tape }: { tape: Tape }) {
  const onchain = latestOnchain(tape);
  const street = tape.current?.street;
  const band =
    street?.official && street.parallel
      ? `${nairaShort(street.official)} – ${nairaShort(street.parallel)}`
      : null;
  // Above means a dollar buys fewer cNGN onchain than naira off-chain.
  const sample = tape.rates.at(-1);
  const premium = sample?.naira ? (sample.naira / sample.ngnPerUsdt - 1) * 100 : null;

  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-3 pt-3">
      <div>
        <p className="num text-5xl leading-none font-medium tracking-tight">
          {onchain ? naira(onchain.value) : "—"}
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {onchain ? `per USDT · ${ago(onchain.at, tape.generatedAt)}` : "waiting for a fair value"}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 pb-1 font-mono text-xs whitespace-nowrap">
        <dt className="text-muted-foreground">STREET BAND</dt>
        <dd className="text-right">{band ?? "—"}</dd>
        <dt className="text-muted-foreground">VS BAND</dt>
        <dd className="text-right">
          {street?.offBandPct == null
            ? "—"
            : street.offBandPct === 0
              ? "inside"
              : `${street.offBandPct.toFixed(1)}% outside`}
        </dd>
        <dt className="text-muted-foreground">VS EXCHANGES</dt>
        <dd className="text-right">
          {premium == null
            ? "—"
            : `${Math.abs(premium).toFixed(2)}% ${premium >= 0 ? "above" : "below"}`}
        </dd>
      </dl>
    </div>
  );
}

export function RatesChart({ tape }: { tape: Tape }) {
  const [table, setTable] = useState(false);
  const rows = rowsFrom(tape);
  const spans = modeSpans(tape);
  const { ticks, daily } = timeTicks(rows[0]?.at ?? 0, rows.at(-1)?.at ?? 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>cNGN / USDT · onchain · 7 days</CardTitle>
        <Headline tape={tape} />
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTable(!table)}
            aria-expanded={table}
          >
            {table ? "Hide table" : "Show table"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Collecting rates. The agent samples the onchain rate every 10 minutes and the street
            rate on each risk check.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <LineChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              {spans.map((span) => (
                <ReferenceArea
                  key={span.from}
                  x1={span.from}
                  x2={span.to}
                  fill="var(--foreground)"
                  fillOpacity={span.mode === "halted" ? 0.1 : 0.035}
                  ifOverflow="extendDomain"
                />
              ))}
              <XAxis
                dataKey="at"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={(at: number) => (daily ? day(at) : clock(at))}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                domain={[
                  (min: number) => Math.floor(min / 10) * 10 - 10,
                  (max: number) => Math.ceil(max / 10) * 10 + 10,
                ]}
                tickFormatter={(value: number) => nairaShort(value)}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => when(Number(payload?.[0]?.payload?.at))}
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">
                          {config[name as keyof typeof config]?.label ?? name}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {naira(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="onchain"
                type="linear"
                stroke="var(--color-onchain)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="official"
                type="stepAfter"
                stroke="var(--color-official)"
                strokeWidth={1.5}
                dot={{ r: 2.5 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="parallel"
                type="stepAfter"
                stroke="var(--color-parallel)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={{ r: 2.5 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
        <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground/8" /> Caution span
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground/25" /> Halted span
          </span>
        </div>
        {table && (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Onchain</TableHead>
                <TableHead className="text-right">Official</TableHead>
                <TableHead className="text-right">Parallel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows]
                .reverse()
                .slice(0, 200)
                .map((row) => (
                  <TableRow key={row.at}>
                    <TableCell>{when(row.at)}</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(row.onchain)}</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(row.official)}</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(row.parallel)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
