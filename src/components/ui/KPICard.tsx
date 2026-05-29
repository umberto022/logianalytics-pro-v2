import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label:     string;
  value:     string;
  delta?:    string;
  deltaType?: "positive" | "negative" | "neutral";
  icon?:     LucideIcon;
  color?:    "indigo" | "green" | "amber" | "red" | "blue";
}

const colorMap = {
  indigo: "bg-indigo-50 text-indigo-600",
  green:  "bg-emerald-50 text-emerald-600",
  amber:  "bg-amber-50 text-amber-600",
  red:    "bg-red-50 text-red-600",
  blue:   "bg-blue-50 text-blue-600",
};

const deltaColorMap = {
  positive: "text-emerald-600",
  negative: "text-red-500",
  neutral:  "text-slate-500",
};

export function KPICard({
  label, value, delta, deltaType = "neutral", icon: Icon, color = "indigo",
}: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none mb-1">{value}</p>
      {delta && (
        <p className={cn("text-xs font-medium mt-1", deltaColorMap[deltaType])}>
          {delta}
        </p>
      )}
    </div>
  );
}
