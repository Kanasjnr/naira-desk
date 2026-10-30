import { clock, dollars, naira } from "@/lib/format";
import type { Taker } from "@/lib/taker";
import type { Tape } from "@/lib/tape";
import type { Vault } from "@/lib/vault";
import { ModeBadge } from "./mode-badge";

function Item({ label, value, lit = false }: { label: string; value: string; lit?: boolean }) {
  return (
    <span className="flex shrink-0 items-baseline gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={lit ? "text-signal" : "text-foreground"}>{value}</span>
    </span>
  );
}

// The trader scans every 15 seconds, so a scan older than this means the agent stopped.
const LIVE_MS = 60_000;

// Compares the trader's last scan with the tape's own clock, so it needs no timer of its own.
function Heartbeat({ tape, stale }: { tape: Tape | null; stale: boolean }) {
  const at = tape?.taker?.status?.at;
  const live = !stale && at != null && tape != null && tape.generatedAt - at < LIVE_MS;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="relative flex size-2">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full ${live ? "bg-signal" : "bg-muted-foreground"}`}
        />
      </span>
      <span className={live ? "text-signal" : "text-muted-foreground"}>
        {live ? "AGENT LIVE" : "AGENT OFFLINE"}
      </span>
      {at != null && (
        <span className="text-muted-foreground">
          {live ? "scanned" : "last scan"} {clock(at)}
        </span>
      )}
    </span>
  );
}

export function Ticker({
  tape,
  vault,
  taker,
  stale,
}: {
  tape: Tape | null;
  vault: Vault | null;
  taker: Taker | null;
  stale: boolean;
}) {
  const sample = tape?.rates.at(-1);
  const street = tape?.current?.street;
  const onchain = sample?.ngnPerUsdt ?? street?.onchain;
  const premium = sample?.naira ? (sample.naira / sample.ngnPerUsdt - 1) * 100 : null;
  const nav = vault?.summary.nav.last;

  return (
    <div className="flex items-center gap-6 overflow-x-auto rounded-md border bg-card px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums">
      <Heartbeat tape={tape} stale={stale} />
      {tape?.current && <ModeBadge mode={tape.current.mode} />}
      <Item label="cNGN/USDT" value={onchain ? naira(onchain) : "—"} lit />
      {street?.official && <Item label="OFFICIAL" value={naira(street.official)} />}
      {street?.parallel && <Item label="PARALLEL" value={naira(street.parallel)} />}
      {sample?.naira && <Item label="EXCHANGES" value={naira(sample.naira)} />}
      {premium != null && (
        <Item label="SPREAD" value={`${premium >= 0 ? "+" : ""}${premium.toFixed(2)}%`} />
      )}
      {taker && <Item label="TAKER P&L" value={`+${dollars(taker.profitUsdt)}`} lit />}
      {nav && <Item label="VAULT NAV" value={dollars(nav.nav)} />}
      {tape && <Item label="AGENT" value={`#${tape.agent.agentId}`} />}
    </div>
  );
}
