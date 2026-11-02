import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dollars } from "@/lib/format";
import type { Tape } from "@/lib/tape";
import { AddressLink, TxLink } from "./tx-link";
import { When } from "./when";

const PROVIDERS: Record<string, string> = {
  "x.posts.search": "TikHub X search",
  "cencori.v1.chat.completions": "Cencori rating",
};

export function Reviews({ tape }: { tape: Tape }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier reviews</CardTitle>
        <CardDescription>
          Once a day the agent rates each service it paid on its ERC-8004 identity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tape.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviews yet. The first posts a day after the agent starts paying.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...tape.reviews].reverse().map((r) => (
                <TableRow key={r.txHash}>
                  <TableCell>
                    <When at={r.at} />
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-24 truncate sm:max-w-none">
                      {PROVIDERS[r.capability] ?? r.capability} #{r.agentId}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.value}/100</TableCell>
                  <TableCell>
                    <TxLink hash={r.txHash} compact />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function Sales({ tape }: { tape: Tape }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Naira API sales</CardTitle>
        <CardDescription>
          Other agents pay $0.005 over x402 for this data. The agent settles each payment itself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tape.sales.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...tape.sales.recent].reverse().map((s) => (
                <TableRow key={s.txHash}>
                  <TableCell>
                    <When at={s.at} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <AddressLink address={s.payer} />
                      {s.ours && (
                        <Badge
                          variant="secondary"
                          title="The desk's demo buyer, not counted as a sale"
                        >
                          demo
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dollars(Number(s.amount) / 1e6)}
                  </TableCell>
                  <TableCell>
                    <TxLink hash={s.txHash} compact />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
