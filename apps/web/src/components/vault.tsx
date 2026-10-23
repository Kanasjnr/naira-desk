import { OctagonX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { ago, dollars, naira, when } from "@/lib/format";
import type { Vault } from "@/lib/vault";
import { Tile } from "./figures";
import { AddressLink, TxLink } from "./tx-link";

const SHOWN = 20;

function Fills({ vault }: { vault: Vault }) {
  const fills = vault.fills.slice(0, SHOWN);
  if (fills.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fills yet. Takers on Textile trade against the vault while Stitch is quoting.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Desk</TableHead>
          <TableHead className="text-right">Naira</TableHead>
          <TableHead className="text-right">USDT</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead>Taker</TableHead>
          <TableHead>Tx</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fills.map((fill) => (
          <TableRow key={`${fill.block}-${fill.logIndex}`}>
            <TableCell>{when(fill.at)}</TableCell>
            <TableCell>{fill.side === "buy" ? "Bought naira" : "Sold naira"}</TableCell>
            <TableCell className="text-right tabular-nums">{naira(fill.cngn)}</TableCell>
            <TableCell className="text-right tabular-nums">{fill.usdt.toFixed(2)}</TableCell>
            <TableCell className="text-right tabular-nums">{naira(fill.ngnPerUsdt)}</TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <AddressLink address={fill.filler} />
                {fill.ours && (
                  <Badge variant="secondary" title="Our own wallet, left out of volume">
                    ours
                  </Badge>
                )}
              </span>
            </TableCell>
            <TableCell>
              <TxLink hash={fill.tx} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function VaultSection({ vault }: { vault: Vault | null }) {
  if (!vault) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>The vault</CardTitle>
          <CardDescription>
            The indexer isn't reachable right now. This fills in once it is.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { summary, fetchedAt: now } = vault;
  const last = summary.nav.last;
  return (
    <Card>
      <CardHeader>
        <CardTitle>The vault</CardTitle>
        <CardDescription>
          The community-funded float the desk quotes from on Textile. Every number here is read from
          Celo, and trades from our own wallets are left out of volume and LP counts.
        </CardDescription>
        {summary.paused && (
          <CardAction>
            <Badge variant="destructive" className="gap-1.5">
              <OctagonX className="size-3.5" aria-hidden />
              Paused
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Tile
            label="Vault value"
            value={last ? dollars(last.nav) : "—"}
            sub={last ? `settled ${ago(last.at, now)}` : "not settled yet"}
          />
          <Tile
            label="Share price"
            value={last?.perShare ? `$${last.perShare.toFixed(4)}` : "—"}
            sub={`${summary.nav.shares.toLocaleString("en-NG")} shares`}
          />
          <Tile
            label="Volume filled"
            value={dollars(summary.fills.volumeUsdt)}
            sub={`${summary.fills.count} ${summary.fills.count === 1 ? "fill" : "fills"}`}
          />
          <Tile
            label="Independent volume"
            value={dollars(summary.fills.independentVolumeUsdt)}
            sub={`${summary.fills.takers} ${summary.fills.takers === 1 ? "taker" : "takers"}`}
          />
          <Tile
            label="Independent LPs"
            value={String(summary.lps.independent)}
            sub={`of ${summary.lps.depositors} · ${dollars(summary.lps.depositedUsdt)} deposited`}
          />
        </div>
        <Fills vault={vault} />
        <p className="text-xs text-muted-foreground">
          <AddressLink address={summary.vault} label="Vault contract" />
          {summary.synced.block
            ? ` · indexed to block ${summary.synced.block.toLocaleString("en-NG")}, the safe head`
            : " · indexing"}
          {summary.synced.at ? `, ${ago(summary.synced.at, now)}` : ""} · raw data at{" "}
          <a href="/api/vault" className="underline">
            /api/vault
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
