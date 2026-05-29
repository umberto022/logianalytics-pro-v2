import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Timestamp } from "firebase/firestore";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale/es";
import type { InventoryItem, StockStatus } from "@/types";
import { LOW_STOCK_THRESHOLD } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, decimals = 2): string {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtCurrency(n: number): string {
  return `$${fmt(n)}`;
}

export function fmtDate(ts: Timestamp | Date | string | null | undefined): string {
  if (!ts) return "—";
  const d =
    ts instanceof Timestamp ? ts.toDate()
    : ts instanceof Date    ? ts
    : new Date(ts as string);
  return format(d, "dd MMM yyyy", { locale: es });
}

export function fmtDatetime(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return format(ts.toDate(), "dd MMM yyyy HH:mm", { locale: es });
}

export function getStockStatus(item: InventoryItem): StockStatus {
  const { currentStock: c, minStock: mn, maxStock: mx } = item;
  if (c <= mn) return "critical";
  const threshold = mn + Math.max(1, Math.floor((mx - mn) * LOW_STOCK_THRESHOLD));
  if (mx > mn && c <= threshold) return "low";
  return "ok";
}

export function sinceDate(days: number): Date {
  return subDays(new Date(), days);
}

export function generateSku(category: string, name: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `${category.slice(0, 3).toUpperCase()}-${name.slice(0, 4).toUpperCase()}-${ts}`;
}

export function marginPct(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}
