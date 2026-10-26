import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ago, dollars, naira, nairaShort } from "@/lib/format";
import type { Tape } from "@/lib/tape";

function latestOnchain(tape: Tape) {
  const sample = tape.rates.at(-1);
  if (sample) return { value: sample.ngnPerUsdt, at: sample.at };
  const street = tape.current?.street;
  return street?.onchain && tape.current
    ? { value: street.onchain, at: tape.current.checkedAt }
    : null;
}

export function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{sub}</CardContent>
    </Card>
  );
}

export function Figures({ tape }: { tape: Tape }) {
  const onchain = latestOnchain(tape);
  const street = tape.current?.street;
  const band =
    street?.official && street.parallel
      ? `${nairaShort(street.official)} – ${nairaShort(street.parallel)}`
      : street?.parallel
        ? nairaShort(street.parallel)
        : "not quoted yet";
  const bandNote =
    street?.offBandPct == null
      ? "official to parallel, from the posts the agent bought"
      : street.offBandPct === 0
        ? "onchain is inside the band"
        : `onchain is ${street.offBandPct.toFixed(1)}% outside the band`;
  // Above means a dollar buys fewer cNGN onchain than naira off-chain.
  const sample = tape.rates.at(-1);
  const premium = sample?.naira ? (sample.naira / sample.ngnPerUsdt - 1) * 100 : null;
  const changes = tape.decisions.filter(
    (d, i) => i > 0 && d.mode !== tape.decisions[i - 1]?.mode,
  ).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader>
          <CardDescription>Onchain naira rate</CardDescription>
          <p className="text-5xl font-semibold tracking-tight">
            {onchain ? naira(onchain.value) : "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {onchain
              ? `per USDT, cNGN on Celo · ${ago(onchain.at, tape.generatedAt)}`
              : "waiting for a fair value"}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Street band</p>
            <p className="text-xl font-semibold">{band}</p>
            <p className="text-sm text-muted-foreground">{bandNote}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">cNGN vs the naira</p>
            <p className="text-xl font-semibold">
              {premium == null
                ? "—"
                : `${Math.abs(premium).toFixed(2)}% ${premium >= 0 ? "above" : "below"}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {sample?.naira
                ? `the naira is ${naira(sample.naira)} per USDT on exchanges`
                : "waiting for an exchange rate"}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Tile
          label="Paid research"
          value={dollars(tape.research.usd)}
          sub={`${tape.research.calls} calls through buy`}
        />
        <Tile
          label="Risk checks"
          value={String(tape.decisions.length)}
          sub={`${changes} mode ${changes === 1 ? "change" : "changes"}`}
        />
        <Tile
          label="Supplier reviews"
          value={String(tape.reviews.length)}
          sub="onchain, on ERC-8004"
        />
        <Tile
          label="API sales"
          value={String(tape.sales.count)}
          sub={`${dollars(tape.sales.usd)} earned`}
        />
      </div>
    </div>
  );
}
