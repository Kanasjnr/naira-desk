"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import { clock, day, dollars, when } from "@/lib/format";
import type { Take } from "@/lib/taker";
import type { Gap } from "@/lib/tape";
import { timeTicks } from "./rates-chart";

export const MARKETS = ["cNGN", "wBRL", "wARS"] as const;

const markets = {
  cNGN: { label: "cNGN", color: "var(--market-cngn)" },
  wBRL: { label: "wBRL", color: "var(--market-wbrl)" },
  wARS: { label: "wARS", color: "var(--market-wars)" },
} satisfies ChartConfig;

export const edge = (profit: number, spend: number) => (spend ? (profit / spend) * 100 : 0);

function Tip({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="grid min-w-44 gap-1 rounded-sm border bg-popover px-2.5 py-1.5 font-mono text-xs">
      <p className="font-medium">{title}</p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

function timeAxis(from: number, to: number) {
  const { ticks, daily } = timeTicks(from, to);
  return (
    <XAxis
      dataKey="at"
      type="number"
      scale="time"
      domain={[from, to]}
      ticks={ticks}
      tickFormatter={(at: number) => (daily ? day(at) : clock(at))}
      tickLine={false}
      axisLine={false}
      minTickGap={32}
    />
  );
}

type ProfitRow = { at: number; profit: number; take?: Take };

// Running profit, flat from the last take to now so a quiet spell shows as one.
export function ProfitChart({ takes, now }: { takes: Take[]; now: number }) {
  const sorted = [...takes].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  if (!first) {
    return (
      <p className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
        No trades yet. Profit builds here, one step per take.
      </p>
    );
  }
  const pad = Math.max((now - first.at) * 0.04, 10 * 60_000);
  const rows: ProfitRow[] = [{ at: first.at - pad, profit: 0 }];
  for (const take of sorted) {
    rows.push({ at: take.at, profit: (rows.at(-1)?.profit ?? 0) + take.profit, take });
  }
  rows.push({ at: now, profit: rows.at(-1)?.profit ?? 0 });

  return (
    <ChartContainer
      config={{ profit: { label: "Profit", color: "var(--good)" } }}
      className="aspect-auto h-56 w-full"
    >
      <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="profit-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        {timeAxis(rows[0]?.at ?? 0, now)}
        <YAxis
          tickFormatter={(value: number) => dollars(value)}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as ProfitRow | undefined;
            if (!active || !row?.take) return null;
            return (
              <Tip
                title={`${row.take.market} · ${when(row.take.at)}`}
                rows={[
                  ["Paid on Textile", dollars(row.take.spent)],
                  ["Pool paid", dollars(row.take.received)],
                  ["This trade", `+${dollars(row.take.profit)}`],
                  ["Running total", dollars(row.profit)],
                ]}
              />
            );
          }}
        />
        <Area
          dataKey="profit"
          type="stepAfter"
          stroke="var(--color-profit)"
          strokeWidth={2}
          fill="url(#profit-fill)"
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: ProfitRow }) =>
            props.payload?.take ? (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={3.5}
                fill="var(--color-profit)"
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            ) : (
              <g key={props.index} />
            )
          }
        />
      </AreaChart>
    </ChartContainer>
  );
}

type GapPoint = { at: number; edge: number; gap?: Gap; take?: Take };

// Every gap the trader logged, as the edge over Uniswap before gas. Takes sit on top as stars.
export function GapsChart({ gaps, takes, now }: { gaps: Gap[]; takes: Take[]; now: number }) {
  if (gaps.length === 0 && takes.length === 0) {
    return (
      <p className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
        No gaps seen yet. The trader scans every market every 15 seconds.
      </p>
    );
  }
  const points = (market: string): GapPoint[] =>
    gaps
      .filter((gap) => gap.market === market)
      .map((gap) => ({ at: gap.at, edge: edge(gap.profitUsd, gap.spendUsd), gap }));
  const taken: GapPoint[] = takes.map((take) => ({
    at: take.at,
    edge: edge(take.profit, take.spent),
    take,
  }));
  const from = Math.min(...gaps.map((gap) => gap.at), ...takes.map((take) => take.at));

  return (
    <ChartContainer
      config={{ ...markets, taken: { label: "Taken", color: "var(--foreground)" } }}
      className="aspect-auto h-56 w-full"
    >
      <ScatterChart margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        {timeAxis(from, now)}
        <YAxis
          dataKey="edge"
          type="number"
          tickFormatter={(value: number) => `${value.toFixed(1)}%`}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <ZAxis range={[36, 36]} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as GapPoint | undefined;
            if (!active || !point) return null;
            if (point.take) {
              return (
                <Tip
                  title={`Took ${point.take.market} · ${when(point.at)}`}
                  rows={[
                    ["Paid", dollars(point.take.spent)],
                    ["Profit", `+${dollars(point.take.profit)}`],
                    ["Edge", `${point.edge.toFixed(2)}%`],
                  ]}
                />
              );
            }
            if (!point.gap) return null;
            return (
              <Tip
                title={`${point.gap.market} gap · ${when(point.at)}`}
                rows={[
                  ["Buy on Textile", dollars(point.gap.spendUsd)],
                  ["Pool pays more by", dollars(point.gap.profitUsd)],
                  ["Gas", dollars(point.gap.gasUsd)],
                  ["Edge before gas", `${point.edge.toFixed(2)}%`],
                ]}
              />
            );
          }}
        />
        <ChartLegend content={<ChartLegendContent nameKey="value" />} itemSorter={null} />
        {MARKETS.map((market) => (
          <Scatter
            key={market}
            name={market}
            dataKey="edge"
            data={points(market)}
            fill={`var(--color-${market})`}
            fillOpacity={0.75}
            isAnimationActive={false}
          />
        ))}
        <Scatter
          name="taken"
          dataKey="edge"
          data={taken}
          fill="var(--color-taken)"
          shape="star"
          isAnimationActive={false}
        />
      </ScatterChart>
    </ChartContainer>
  );
}
