import { type LucideIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label:      string;
  value:      string;
  delta?:     string;
  deltaType?: "positive" | "negative" | "neutral";
  icon?:      LucideIcon;
  color?:     "indigo" | "green" | "amber" | "red" | "blue";
  onClick?:   () => void;
  active?:    boolean;
}

const colorMap = {
  indigo: { icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",   bar: "bg-indigo-500",   btn: "text-indigo-600 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/15"  },
  green:  { icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", bar: "bg-emerald-500",  btn: "text-emerald-600 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/15" },
  amber:  { icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",     bar: "bg-amber-500",    btn: "text-amber-600 group-hover:bg-amber-50 dark:group-hover:bg-amber-500/15"    },
  red:    { icon: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",         bar: "bg-red-500",      btn: "text-red-600 group-hover:bg-red-50 dark:group-hover:bg-red-500/15"        },
  blue:   { icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",       bar: "bg-blue-500",     btn: "text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/15"      },
};

const deltaColorMap = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-500 dark:text-red-400",
  neutral:  "text-slate-500 dark:text-slate-400",
};

export function KPICard({
  label, value, delta, deltaType = "neutral", icon: Icon, color = "indigo", onClick, active = false,
}: KPICardProps) {
  const c = colorMap[color];
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-800 rounded-2xl border transition-all duration-200 group overflow-hidden relative select-none flex flex-col",
        onClick ? "cursor-pointer hover:shadow-lg active:scale-[0.98]" : "hover:shadow-md",
        active ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-500/30 shadow-md -translate-y-0.5" : "border-slate-100 dark:border-slate-700 shadow-sm",
      )}
    >
      {/* Top accent bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1 transition-opacity",
        c.bar,
        active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
      )} />

      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          {Icon && (
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", c.icon)}>
              <Icon size={17} />
            </div>
          )}
        </div>
        <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none mb-1 tracking-tight">{value}</p>
        {delta && (
          <p className={cn("text-xs font-medium mt-1.5 flex items-center gap-1", deltaColorMap[deltaType])}>
            {deltaType === "positive" && "↑"}
            {deltaType === "negative" && "↓"}
            {delta}
          </p>
        )}
      </div>

      {/* "Ver desglose" footer — only when clickable */}
      {onClick && (
        <div className={cn(
          "flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-700 text-xs font-semibold transition-colors",
          c.btn,
          active ? "bg-slate-50 dark:bg-slate-700/40" : "",
        )}>
          <span>{active ? "Ocultar desglose" : "Ver desglose"}</span>
          <ChevronDown
            size={14}
            className={cn("transition-transform duration-200", active ? "rotate-180" : "")}
          />
        </div>
      )}
    </div>
  );
}
