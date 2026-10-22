import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Mode } from "@/lib/tape";

const MODES = {
  normal: { label: "Normal", icon: CircleCheck, className: "text-good" },
  caution: { label: "Caution", icon: TriangleAlert, className: "text-warning" },
  halted: { label: "Halted", icon: OctagonX, className: "text-critical" },
} as const;

export function ModeBadge({ mode }: { mode: Mode }) {
  const { label, icon: Icon, className } = MODES[mode] ?? MODES.caution;
  return (
    <Badge variant="outline" className="gap-1.5 font-semibold">
      <Icon className={`size-3.5 ${className}`} aria-hidden />
      {label}
    </Badge>
  );
}
