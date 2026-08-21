import { cn } from "@/lib/utils";
import type { StockStatus } from "@/types";

const styles: Record<StockStatus, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  low:      "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  ok:       "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
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
