import { celoscan, isAddress, isTx, short } from "@/lib/format";

export function TxLink({ hash }: { hash: string }) {
  if (!isTx(hash)) return null;
  return (
    <a
      href={celoscan("tx", hash)}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-signal hover:underline"
    >
      {short(hash)}
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
