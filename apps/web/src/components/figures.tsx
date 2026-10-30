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
    <Card size="sm" className="gap-1.5">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
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

// The desk at a glance, from the agent's logs and the indexer.
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
  const changes =
    tape?.decisions.filter((d, i) => i > 0 && d.mode !== tape.decisions[i - 1]?.mode).length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile
        label="Taker profit"
        value={taker ? `+${dollars(taker.profitUsdt)}` : "—"}
        sub={taker ? `${taker.count} trades · ${dollars(taker.volumeUsdt)}` : "indexer offline"}
        lit={Boolean(taker?.profitUsdt)}
      />
      <Tile
        label="Vault value"
        value={nav ? dollars(nav.nav) : "—"}
        sub={nav?.perShare ? `$${nav.perShare.toFixed(4)} a share` : "not settled yet"}
      />
      <Tile
        label="Volume filled"
        value={vault ? dollars(vault.summary.fills.volumeUsdt) : "—"}
        sub={
          vault
            ? `${dollars(vault.summary.fills.independentVolumeUsdt)} independent`
            : "indexer offline"
        }
      />
      <Tile
        label="Paid research"
        value={tape ? dollars(tape.research.usd) : "—"}
        sub={tape ? `${tape.research.calls} calls through buy` : "agent offline"}
      />
      <Tile
        label="Risk checks"
        value={tape ? String(tape.decisions.length) : "—"}
        sub={`${changes} mode ${changes === 1 ? "change" : "changes"}`}
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
