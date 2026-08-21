"use client";

import { X } from "lucide-react";
import { fmtCurrency, fmt } from "@/lib/utils";
import { StockBadge } from "@/components/ui/StockBadge";
import { getStockStatus } from "@/lib/utils";
import type {
  SalesSummary, RouteStats, ProductStats, ClientStats, InventoryItem,
} from "@/types";

interface KPIDetailModalProps {
  type: "revenue" | "profit" | "sales" | "inventory" | "alerts";
  period: number;
  onClose: () => void;
  // data
  summary:       SalesSummary;
  routes:        RouteStats[];
  products:      ProductStats[];
  byClient:      ClientStats[];
  items:         InventoryItem[];
  invValue:      number;
  invByValue:    InventoryItem[];
  criticalItems: InventoryItem[];
  lowItems:      InventoryItem[];
  marginPct:     number;
  curRevenue:    number;
  prevRevenue:   number;
  curProfit:     number;
  prevProfit:    number;
  revDelta:      number | null;
  profDelta:     number | null;
}

const HEADER: Record<KPIDetailModalProps["type"], { title: string; color: string; bg: string }> = {
  revenue:   { title: "Desglose de Ingresos",        color: "text-indigo-700 dark:text-indigo-300",  bg: "bg-indigo-50 border-indigo-200 dark:bg-indigo-500/15 dark:border-indigo-500/30"  },
  profit:    { title: "Desglose de Ganancia",         color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30" },
  sales:     { title: "Desglose de Ventas",           color: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-50 border-blue-200 dark:bg-blue-500/15 dark:border-blue-500/30"    },
  inventory: { title: "Desglose de Valor Inventario", color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30"   },
  alerts:    { title: "Alertas de Stock",             color: "text-red-700 dark:text-red-300",     bg: "bg-red-50 border-red-200 dark:bg-red-500/15 dark:border-red-500/30"      },
};

export function KPIDetailModal({
  type, period, onClose,
  summary, routes, products, byClient, items, invValue, invByValue,
  criticalItems, lowItems, marginPct,
  curRevenue, prevRevenue, curProfit, prevProfit, revDelta, profDelta,
}: KPIDetailModalProps) {
  const h = HEADER[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto z-10 dark:bg-slate-800">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${h.bg} rounded-t-2xl`}>
          <h2 className={`font-bold text-base ${h.color}`}>{h.title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 transition text-slate-500 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── INGRESOS ── */}
          {type === "revenue" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <Stat label="Mes actual"   value={fmtCurrency(curRevenue)} />
                <Stat label="Mes anterior" value={fmtCurrency(prevRevenue)} />
                <Stat
                  label="Variación"
                  value={revDelta !== null ? `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}%` : "—"}
                  highlight={revDelta !== null ? (revDelta >= 0 ? "green" : "red") : "none"}
                />
              </div>
              <Section title={`Total — últimos ${period} días`}>
                <BigStat label="Ingresos totales" value={fmtCurrency(summary.revenue)} />
              </Section>
              {routes.length > 0 && (
                <Section title="Por ruta">
                  {routes.slice(0, 8).map((r) => (
                    <Bar
                      key={r.route}
                      label={r.route || "Sin ruta"}
                      value={fmtCurrency(r.revenue)}
                      pct={summary.revenue > 0 ? (r.revenue / summary.revenue) * 100 : 0}
                      color="bg-indigo-400"
                    />
                  ))}
                </Section>
              )}
            </>
          )}

          {/* ── GANANCIA ── */}
          {type === "profit" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <Stat label="Mes actual"   value={fmtCurrency(curProfit)} />
                <Stat label="Mes anterior" value={fmtCurrency(prevProfit)} />
                <Stat
                  label="Variación"
                  value={profDelta !== null ? `${profDelta >= 0 ? "+" : ""}${profDelta.toFixed(1)}%` : "—"}
                  highlight={profDelta !== null ? (profDelta >= 0 ? "green" : "red") : "none"}
                />
              </div>
              <Section title={`Total — últimos ${period} días`}>
                <BigStat label="Ganancia total" value={fmtCurrency(summary.profit)} />
                <BigStat label="Margen promedio" value={`${fmt(marginPct, 1)}%`} />
              </Section>
              {products.length > 0 && (
                <Section title="Top productos por ganancia">
                  {products.slice(0, 8).map((p) => (
                    <div key={p.productName} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{p.productName}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-slate-400">{fmt(p.marginPct, 1)}% margen</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 w-20 text-right">{fmtCurrency(p.profit)}</span>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}

          {/* ── VENTAS ── */}
          {type === "sales" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <Stat label="Total ventas"    value={fmt(summary.numSales, 0)} />
                <Stat label="Promedio/día"    value={fmt(summary.numSales / Math.max(period, 1), 1)} />
                <Stat label="Ticket promedio" value={fmtCurrency(summary.numSales > 0 ? summary.revenue / summary.numSales : 0)} />
              </div>
              <Section title="Totales del período">
                <BigStat label="Ingresos" value={fmtCurrency(summary.revenue)} />
                <BigStat label="Ganancia" value={fmtCurrency(summary.profit)} />
                <BigStat label="Unidades vendidas" value={fmt(summary.totalUnits, 0)} />
              </Section>
              {byClient.length > 0 && (
                <Section title="Top clientes">
                  {byClient.map((c) => (
                    <div key={c.client} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{c.client || "Sin cliente"}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-xs text-slate-400">{c.numSales} ventas</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 w-20 text-right">{fmtCurrency(c.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
              {routes.length > 0 && (
                <Section title="Por ruta">
                  {routes.slice(0, 6).map((r) => (
                    <Bar
                      key={r.route}
                      label={r.route || "Sin ruta"}
                      value={`${r.numSales} venta${r.numSales !== 1 ? "s" : ""}`}
                      pct={summary.numSales > 0 ? (r.numSales / summary.numSales) * 100 : 0}
                      color="bg-blue-400"
                    />
                  ))}
                </Section>
              )}
            </>
          )}

          {/* ── INVENTARIO ── */}
          {type === "inventory" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <Stat label="Total productos" value={String(items.length)} />
                <Stat label="Valor total"     value={fmtCurrency(invValue)} />
                <Stat label="Costo promedio"  value={fmtCurrency(items.length > 0 ? invValue / items.length : 0)} />
              </div>
              <Section title="Productos de mayor valor en inventario">
                {invByValue.map((i) => {
                  const val = i.currentStock * i.unitCost;
                  return (
                    <Bar
                      key={i.id}
                      label={`${i.name} (${i.currentStock} u.)`}
                      value={fmtCurrency(val)}
                      pct={invValue > 0 ? (val / invValue) * 100 : 0}
                      color="bg-amber-400"
                    />
                  );
                })}
              </Section>
            </>
          )}

          {/* ── ALERTAS ── */}
          {type === "alerts" && (
            <>
              <div className="grid grid-cols-2 gap-3 text-center">
                <Stat label="Productos críticos" value={String(criticalItems.length)} highlight={criticalItems.length > 0 ? "red" : "none"} />
                <Stat label="Stock bajo"         value={String(lowItems.length)}      highlight={lowItems.length > 0 ? "orange" : "none"} />
              </div>
              {criticalItems.length === 0 && lowItems.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-4">Sin alertas activas 🎉</p>
              ) : (
                <Section title="Detalle por producto">
                  {[...criticalItems, ...lowItems].map((i) => {
                    const s = getStockStatus(i);
                    return (
                      <div key={i.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{i.name}</p>
                          <p className="text-xs text-slate-400">{i.category || "Sin categoría"} · SKU: {i.sku}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {i.currentStock} / mín {i.minStock}
                          </span>
                          <StockBadge status={s} />
                        </div>
                      </div>
                    );
                  })}
                </Section>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, highlight = "none" }: { label: string; value: string; highlight?: "green" | "red" | "orange" | "none" }) {
  const valueColor =
    highlight === "green"  ? "text-emerald-700 dark:text-emerald-400" :
    highlight === "red"    ? "text-red-600 dark:text-red-400"     :
    highlight === "orange" ? "text-amber-600 dark:text-amber-400"   :
    "text-slate-900 dark:text-slate-100";
  return (
    <div className="bg-slate-50 rounded-xl p-3 dark:bg-slate-700/40">
      <p className="text-xs text-slate-500 mb-1 dark:text-slate-400">{label}</p>
      <p className={`font-bold text-base ${valueColor}`}>{value}</p>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-bold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-slate-50 rounded-xl px-4 py-2 dark:bg-slate-700/40">{children}</div>
    </div>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="py-1.5 border-b border-white dark:border-slate-800 last:border-0">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100 ml-2 flex-shrink-0">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}
