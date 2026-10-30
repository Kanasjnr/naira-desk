import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dollars } from "@/lib/format";
import type { Taker } from "@/lib/taker";
import type { Tape } from "@/lib/tape";
import type { Vault } from "@/lib/vault";

export function Tile({
  label,
  value,
  sub,
  lit = false,
}: {
  label: string;
  value: string;
  sub: string;
  lit?: boolean;
}) {
  return (
    <Card size="sm" className={`gap-1.5 ${lit ? "border-signal/50 bg-signal/5" : ""}`}>
      <CardHeader>
        <CardTitle className={lit ? "text-signal" : ""}>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`num text-2xl font-medium tracking-tight ${lit ? "text-signal" : ""}`}>
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// The desk at a glance, from the agent's logs and the indexer. Volume leads.
export function Figures({
  tape,
  vault,
  taker,
}: {
  tape: Tape | null;
  vault: Vault | null;
  taker: Taker | null;
}) {
  const nav = vault?.summary.nav.last;
  const takerVolume = taker?.volumeUsdt ?? 0;
  const vaultVolume = vault?.summary.fills.volumeUsdt ?? 0;
  const tagged = tape?.agent.taggedTxs;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile
        label="Total volume"
        value={taker || vault ? dollars(takerVolume + vaultVolume) : "—"}
        sub={`${dollars(takerVolume)} Taker · ${dollars(vaultVolume)} vault`}
        lit
      />
      <Tile
        label="Taker profit"
        value={taker ? `+${dollars(taker.profitUsdt)}` : "—"}
        sub={
          taker ? `${taker.count.toLocaleString("en-US")} trades, one tx each` : "indexer offline"
        }
      />
      <Tile
        label="Tagged txs"
        value={tagged != null ? tagged.toLocaleString("en-US") : "—"}
        sub="each carries the attribution tag"
      />
      <Tile
        label="Vault value"
        value={nav ? dollars(nav.nav) : "—"}
        sub={
          vault
            ? `${vault.summary.fills.count} fills · ${dollars(vault.summary.fills.independentVolumeUsdt)} independent`
            : "indexer offline"
        }
      />
      <Tile
        label="Paid research"
        value={tape ? dollars(tape.research.usd) : "—"}
        sub={
          tape
            ? `${tape.research.calls} buy calls · ${tape.decisions.length} risk checks`
            : "agent offline"
        }
      />
      <Tile
        label="Reviews · sales"
        value={
          tape ? `${tape.reviews.length} · ${tape.sales.independent ?? tape.sales.count}` : "—"
        }
        sub={
          tape
            ? `ERC-8004 · ${dollars(tape.sales.independentUsd ?? tape.sales.usd)} from other agents`
            : "agent offline"
        }
      />
    </div>
  );
}
