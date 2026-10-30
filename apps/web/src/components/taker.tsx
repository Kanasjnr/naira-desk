"use client";

import { ArrowRight, Eye, PauseCircle, PlugZap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ago, dollars, when } from "@/lib/format";
import type { Take, Taker } from "@/lib/taker";
import type { TakerTape } from "@/lib/tape";
import { Tile } from "./figures";
import { edge, GapsChart, MARKETS, ProfitChart } from "./taker-charts";
import { AddressLink, TxLink } from "./tx-link";

// The trader scans every 15 seconds, so a status older than this means it stopped.
const QUIET_MS = 2 * 60_000;
const PAGE = 20;

const pct = (n: number) => `${n.toFixed(2)}%`;
const tokens = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

function MarketDot({ market }: { market: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: `var(--market-${market.toLowerCase()})` }}
      aria-hidden
    />
  );
}

function TraderBadge({ tape, now }: { tape: TakerTape | null; now: number }) {
  const status = tape?.status;
  if (!status || now - status.at > QUIET_MS) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <PlugZap className="size-3.5 text-muted-foreground" aria-hidden />
        Not scanning
      </Badge>
    );
  }
  if (!status.idle) {
    return (
      <Badge variant="outline" className="gap-1.5 font-semibold">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-signal" />
        </span>
        Taking
      </Badge>
    );
  }
  const watching = status.idle === "watching only";
  const Icon = watching ? Eye : PauseCircle;
  return (
    <Badge variant="outline" className="gap-1.5" title={status.idle}>
      <Icon
        className={`size-3.5 ${watching ? "text-muted-foreground" : "text-warning"}`}
        aria-hidden
      />
      {watching ? "Watching" : `Watching · ${status.idle}`}
    </Badge>
  );
}

function Step({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-sm border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-base font-semibold tabular-nums">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const Arrow = () => (
  <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
);

// One take end to end: what the maker was paid, what was bought, what the pool paid back.
function LastTrade({ take, now }: { take: Take | undefined; now: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          {take ? "Last trade, in one transaction" : "How a take works, in one transaction"}
        </p>
        {take && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <MarketDot market={take.market} />
            {take.market} · {ago(take.at, now)} · <TxLink hash={take.tx} />
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Step
          label="Pays a Textile maker"
          value={take ? dollars(take.spent) : "USDT"}
          sub="a firm quote for the Taker"
        />
        <Arrow />
        <Step
          label="Buys"
          value={take ? `${tokens(take.amount)} ${take.market}` : "cNGN, wBRL or wARS"}
          sub="below what Uniswap pays"
        />
        <Arrow />
        <Step
          label="Sells to Uniswap for"
          value={take ? dollars(take.received) : "more USDT"}
          sub="in the same transaction"
        />
        <Arrow />
        <div className="min-w-0 flex-1 rounded-sm border border-signal/40 bg-signal/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">Keeps</p>
          <p className="font-mono text-base font-semibold text-signal tabular-nums">
            {take ? `+${dollars(take.profit)}` : "the difference"}
          </p>
          <p className="text-xs text-muted-foreground">
            {take ? `${pct(edge(take.profit, take.spent))} edge` : "or the trade reverts"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Markets({ taker, tape }: { taker: Taker | null; tape: TakerTape | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MARKETS.map((market) => {
        const totals = taker?.markets[market];
        const gaps = tape?.gaps.filter((gap) => gap.market === market) ?? [];
        const widest = Math.max(0, ...gaps.map((gap) => edge(gap.profitUsd, gap.spendUsd)));
        const volume = totals?.volumeUsdt ?? 0;
        const share = taker?.volumeUsdt ? (volume / taker.volumeUsdt) * 100 : 0;
        return (
          <div key={market} className="rounded-md border p-3">
            <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-[0.08em]">
              <MarketDot market={market} />
              {market}/USDT
            </p>
            <p className="mt-2 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Volume
            </p>
            <p className={`num text-2xl font-medium ${volume ? "text-signal" : ""}`}>
              {dollars(volume)}
            </p>
            <div className="mt-1.5 h-1 rounded-full bg-muted" aria-hidden>
              <div className="h-1 rounded-full bg-signal" style={{ width: `${share}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {share.toFixed(0)}% of Taker volume · {totals?.count ?? 0}{" "}
              {totals?.count === 1 ? "trade" : "trades"} ·{" "}
              {totals?.profitUsdt ? `+${dollars(totals.profitUsdt)}` : "$0.00"} profit
            </p>
            <p className="text-xs text-muted-foreground">
              {gaps.length} {gaps.length === 1 ? "gap" : "gaps"} seen this week
              {widest > 0 ? ` · widest ${pct(widest)}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Trades({ takes }: { takes: Take[] }) {
  const [page, setPage] = useState(0);
  if (takes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trades yet. The first lands as soon as a gap pays for its gas and the Taker holds USDT.
      </p>
    );
  }
  const pages = Math.ceil(takes.length / PAGE);
  // New trades arrive at the top, so a page past the end after a refresh falls back to the last.
  const current = Math.min(page, pages - 1);
  const first = current * PAGE;
  const shown = takes.slice(first, first + PAGE);
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Market</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Pool paid</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="text-right">Gas</TableHead>
            <TableHead>Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((take) => (
            <TableRow key={`${take.block}-${take.logIndex}`}>
              <TableCell>{when(take.at)}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <MarketDot market={take.market} />
                  {take.market}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{dollars(take.spent)}</TableCell>
              <TableCell className="text-right tabular-nums">{dollars(take.received)}</TableCell>
              <TableCell className="text-right text-signal tabular-nums">
                +{dollars(take.profit)}{" "}
                <span className="text-xs text-muted-foreground">
                  {pct(edge(take.profit, take.spent))}
                </span>
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {take.gasCelo.toFixed(3)} CELO
              </TableCell>
              <TableCell>
                <TxLink hash={take.tx} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
          <span>
            PAGE {current + 1} OF {pages} · trades {first + 1}–{first + shown.length} of{" "}
            {takes.length}
          </span>
          <span className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Newer
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Older
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

function Misses({ tape }: { tape: TakerTape | null }) {
  const misses = [...(tape?.misses ?? [])].reverse().slice(0, 8);
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        Missed takes
      </p>
      {misses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None. A take that can't land is cancelled before anything is spent.
        </p>
      ) : (
        <ul className="space-y-2">
          {misses.map((miss) => (
            <li key={`${miss.at}-${miss.market}`} className="rounded-sm border px-3 py-2 text-sm">
              <p className="flex items-center gap-2">
                <MarketDot market={miss.market} />
                <span className="font-medium">{miss.market}</span>
                <span className="tabular-nums">{dollars(miss.spendUsd)}</span>
                <span className="ml-auto text-xs text-muted-foreground">{when(miss.at)}</span>
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={miss.reason}>
                {miss.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TakerSection({
  taker,
  tape,
  now,
}: {
  taker: Taker | null;
  tape: TakerTape | null;
  now: number;
}) {
  const takes = taker?.takes ?? [];
  const status = tape?.status;
  const widest = tape?.gaps.reduce<{ edge: number; market: string; at: number } | null>(
    (best, gap) => {
      const e = edge(gap.profitUsd, gap.spendUsd);
      return !best || e > best.edge ? { edge: e, market: gap.market, at: gap.at } : best;
    },
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>The Taker</CardTitle>
        <CardDescription>
          The agent's own trading contract. When a Textile maker quotes cNGN, wBRL or wARS below
          what Uniswap pays, it buys the quote and sells to the pool in the same transaction, so a
          trade either profits or never happens. Trades are read from Celo; gaps come from the
          agent.
        </CardDescription>
        <CardAction>
          <TraderBadge tape={tape} now={now} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Tile
            label="Volume taken"
            value={taker ? dollars(taker.volumeUsdt) : "—"}
            sub={taker ? `${taker.count} ${taker.count === 1 ? "trade" : "trades"} on Textile` : ""}
            lit
          />
          <Tile
            label="Profit"
            value={taker ? `+${dollars(taker.profitUsdt)}` : "—"}
            sub={taker ? `${taker.gasCelo.toFixed(3)} CELO of gas` : "indexer not reachable"}
          />
          <Tile
            label="Gaps seen"
            value={tape ? String(tape.seen.count) : "—"}
            sub={tape ? `${tape.seen.last24h} in the last 24h` : "agent not reachable"}
          />
          <Tile
            label="Widest gap"
            value={widest ? pct(widest.edge) : "—"}
            sub={widest ? `${widest.market}, ${ago(widest.at, now)}` : "none this week"}
          />
          <Tile
            label="Float"
            value={status ? dollars(status.floatUsd) : "—"}
            sub={status ? `${status.gasCelo.toFixed(2)} CELO for gas` : "USDT in the Taker"}
          />
        </div>

        <LastTrade take={takes[0]} now={now} />

        <Markets taker={taker} tape={tape} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Profit over time
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              USDT the Taker grew by, before gas. Each step is one take.
            </p>
            <ProfitChart takes={takes} now={now} />
          </div>
          <div className="rounded-md border p-3">
            <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Gaps the trader saw
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              How far below Uniswap a maker priced, at the best size up to $100. Stars are takes.
            </p>
            <GapsChart gaps={tape?.gaps ?? []} takes={takes} now={now} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Trades
            </p>
            <Trades takes={takes} />
          </div>
          <Misses tape={tape} />
        </div>

        <p className="text-xs text-muted-foreground">
          <AddressLink address={taker?.taker ?? tape?.address ?? ""} label="Taker contract" />
          {taker?.synced.block
            ? ` · trades indexed to block ${taker.synced.block.toLocaleString("en-NG")}`
            : " · indexing"}
          {taker?.synced.at ? `, ${ago(taker.synced.at, now)}` : ""} · raw data at{" "}
          <a href="/api/taker" className="underline">
            /api/taker
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
