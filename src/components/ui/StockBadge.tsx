import { cn } from "@/lib/utils";
import type { StockStatus } from "@/types";

const styles: Record<StockStatus, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  low:      "bg-amber-100 text-amber-700 border border-amber-200",
  ok:       "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const labels: Record<StockStatus, string> = {
  critical: "🔴 Crítico",
  low:      "🟡 Bajo",
  ok:       "🟢 Óptimo",
};

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", styles[status])}>
      {labels[status]}
    </span>
  );
}
