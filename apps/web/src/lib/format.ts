const lagos = (at: number, options: Intl.DateTimeFormatOptions) =>
  new Date(at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", ...options });

export const naira = (n?: number | null) =>
  n == null
    ? "—"
    : `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const nairaShort = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export const dollars = (n: number) =>
  n > 0 && n < 0.1
    ? `$${n.toFixed(3)}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

export const isTx = (hash: string) => /^0x[0-9a-fA-F]{64}$/.test(hash);

export const isAddress = (address: string) => /^0x[0-9a-fA-F]{40}$/.test(address);

export const celoscan = (kind: "tx" | "address", value: string) =>
  `https://celoscan.io/${kind}/${value}`;

export const when = (at: number) =>
  `${lagos(at, { day: "numeric", month: "short" })}, ${lagos(at, { hour: "2-digit", minute: "2-digit" })} WAT`;

export const clock = (at: number) => lagos(at, { hour: "2-digit", minute: "2-digit" });

export const day = (at: number) => lagos(at, { weekday: "short", day: "numeric" });

export function ago(at: number, now: number) {
  const minutes = Math.round((now - at) / 60_000);
  if (Math.abs(minutes) < 60) return minutes >= 0 ? `${minutes} min ago` : `in ${-minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return hours >= 0 ? `${hours}h ago` : `in ${-hours}h`;
  return `${Math.round(hours / 24)} days ago`;
}
