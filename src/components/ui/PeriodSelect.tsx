"use client";

import type { Period } from "@/types";
import { PERIOD_OPTIONS } from "@/types";

interface PeriodSelectProps {
  value:    Period;
  onChange: (v: Period) => void;
}

export function PeriodSelect({ value, onChange }: PeriodSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as Period)}
      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {PERIOD_OPTIONS.map((d) => (
        <option key={d} value={d}>Últimos {d} días</option>
      ))}
    </select>
  );
}
