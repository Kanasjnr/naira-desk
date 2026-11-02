import { clock, date, when } from "@/lib/format";

// A table's time column: the full line on wider screens, date over time on a phone.
export function When({ at }: { at: number }) {
  return (
    <>
      <span className="hidden sm:inline">{when(at)}</span>
      <span className="flex flex-col leading-tight sm:hidden">
        <span>{date(at)}</span>
        <span className="text-xs text-muted-foreground">{clock(at)}</span>
      </span>
    </>
  );
}
