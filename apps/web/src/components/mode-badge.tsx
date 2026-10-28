import type { Mode } from "@/lib/tape";

// One accent: normal is lit, caution is outlined, halted is inverted.
const MODES = {
  normal: { label: "Normal", className: "border-signal/40 text-signal" },
  caution: { label: "Caution", className: "border-dashed border-foreground/50 text-foreground" },
  halted: { label: "Halted", className: "border-foreground bg-foreground text-background" },
} as const;

export function ModeBadge({ mode }: { mode: Mode }) {
  const { label, className } = MODES[mode] ?? MODES.caution;
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 font-mono text-xs font-semibold tracking-[0.12em] uppercase ${className}`}
    >
      {mode === "normal" && <span className="size-1.5 rounded-full bg-signal" aria-hidden />}
      {label}
    </span>
  );
}
