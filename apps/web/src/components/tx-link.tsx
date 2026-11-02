import { ArrowUpRight } from "lucide-react";
import { celoscan, isAddress, isTx, short } from "@/lib/format";

// `compact` shows just an arrow on a phone, where a table has no room for the hash.
export function TxLink({ hash, compact = false }: { hash: string; compact?: boolean }) {
  if (!isTx(hash)) return null;
  return (
    <a
      href={celoscan("tx", hash)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Transaction ${short(hash)} on Celoscan`}
      className="inline-flex shrink-0 items-center font-mono text-xs text-muted-foreground underline-offset-4 hover:text-signal hover:underline"
    >
      {compact ? (
        <>
          <ArrowUpRight className="size-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{short(hash)}</span>
        </>
      ) : (
        short(hash)
      )}
    </a>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  if (!isAddress(address)) return null;
  return (
    <a
      href={celoscan("address", address)}
      target="_blank"
      rel="noreferrer"
      className="underline-offset-4 hover:text-signal hover:underline"
    >
      {label ?? short(address)}
    </a>
  );
}
