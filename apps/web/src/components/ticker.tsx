import { dollars, naira } from "@/lib/format";
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

export function Ticker({
  tape,
  vault,
  taker,
}: {
  tape: Tape | null;
  vault: Vault | null;
  taker: Taker | null;
}) {
  const sample = tape?.rates.at(-1);
  const street = tape?.current?.street;
  const onchain = sample?.ngnPerUsdt ?? street?.onchain;
  const premium = sample?.naira ? (sample.naira / sample.ngnPerUsdt - 1) * 100 : null;
  const nav = vault?.summary.nav.last;

  return (
    <div className="flex items-center gap-6 overflow-x-auto rounded-md border bg-card px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums">
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
