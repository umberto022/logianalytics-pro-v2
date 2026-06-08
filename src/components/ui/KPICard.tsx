import { type LucideIcon } from "lucide-react";
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
  indigo: { icon: "bg-indigo-50 text-indigo-600",  bar: "bg-indigo-500" },
  green:  { icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  amber:  { icon: "bg-amber-50 text-amber-600",     bar: "bg-amber-500" },
  red:    { icon: "bg-red-50 text-red-600",         bar: "bg-red-500" },
  blue:   { icon: "bg-blue-50 text-blue-600",       bar: "bg-blue-500" },
};

const deltaColorMap = {
  positive: "text-emerald-600",
  negative: "text-red-500",
  neutral:  "text-slate-500",
};

export function KPICard({
  label, value, delta, deltaType = "neutral", icon: Icon, color = "indigo", onClick, active = false,
}: KPICardProps) {
  const c = colorMap[color];
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden relative",
        onClick ? "cursor-pointer" : "",
        active ? "border-brand-400 ring-2 ring-brand-200" : "border-slate-100",
      )}
    >
      {/* Subtle top accent bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity", c.bar)} />

      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        {Icon && (
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", c.icon)}>
            <Icon size={17} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none mb-1 tracking-tight">{value}</p>
      {delta && (
        <p className={cn("text-xs font-medium mt-1.5 flex items-center gap-1", deltaColorMap[deltaType])}>
          {deltaType === "positive" && "↑"}
          {deltaType === "negative" && "↓"}
          {delta}
        </p>
      )}
    </div>
  );
}
