"use client";

import { useState, useMemo } from "react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell, PieChart, Pie,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Package, AlertTriangle, Printer,
  ChevronDown, Clock, X,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useSales } from "@/hooks/useSales";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { computeSummary, computeByRoute, computeByProduct, computeDailyStats, computeByClient } from "@/lib/firestore/sales";
import { getStockStatus, fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { StockBadge } from "@/components/ui/StockBadge";
import type { Period, RouteStats, ProductStats, DailyStat, SalesSummary } from "@/types";

type ActiveKPI = "revenue" | "profit" | "sales" | "inventory" | "alerts" | null;

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [useCustom,  setUseCustom]  = useState(false);

  const [activeKPI, setActiveKPI] = useState<ActiveKPI>(null);
  const { items, loading: loadingInv } = useInventory();
  const { sales: allSales, loading: loadingSales } = useSales(180);
  const { orders: purchaseOrders } = usePurchaseOrders();

  const sales = useMemo(() => {
    if (!useCustom || !customFrom) return allSales.filter((s) => {
      const d = s.saleDate.toDate();
      return d >= subDays(new Date(), period);
    });
    const from = new Date(customFrom);
    const to   = customTo ? new Date(customTo + "T23:59:59") : new Date();
    return allSales.filter((s) => {
      const d = s.saleDate.toDate();
      return d >= from && d <= to;
    });
  }, [allSales, useCustom, customFrom, customTo, period]);

  if (loadingInv || loadingSales) return <DashboardSkeleton />;

  const summary: SalesSummary = computeSummary(sales);
  const routes:  RouteStats[] = computeByRoute(sales);
  const products: ProductStats[] = computeByProduct(sales);
  const daily:   DailyStat[]  = computeDailyStats(sales);

  const marginPct = summary.revenue > 0 ? summary.profit / summary.revenue * 100 : 0;
  const invValue  = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);

  // Month-over-month delta (always computed from the full 180-day cache)
  const now = new Date();
  const curMonthStart  = startOfMonth(now);
  const prevMonthStart = startOfMonth(subDays(curMonthStart, 1));
  const prevMonthEnd   = endOfMonth(prevMonthStart);
  const curMonthSales  = allSales.filter((s) => { const d = s.saleDate.toDate(); return d >= curMonthStart && d <= now; });
  const prevMonthSales = allSales.filter((s) => { const d = s.saleDate.toDate(); return d >= prevMonthStart && d <= prevMonthEnd; });
  const curRevenue  = computeSummary(curMonthSales).revenue;
  const prevRevenue = computeSummary(prevMonthSales).revenue;
  const curProfit   = computeSummary(curMonthSales).profit;
  const prevProfit  = computeSummary(prevMonthSales).profit;
  const revDelta  = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const profDelta = prevProfit  > 0 ? ((curProfit  - prevProfit)  / prevProfit)  * 100 : null;
  const fmtDelta  = (d: number | null) => d === null ? "vs mes ant." : `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs mes ant.`;

  // Top 5 products this week
  const weekStart   = subDays(now, 7);
  const weekSales   = allSales.filter((s) => s.saleDate.toDate() >= weekStart);
  const topWeek     = computeByProduct(weekSales).slice(0, 5);

  // Pending / overdue purchase orders
  const pendingOrders = purchaseOrders.filter((o) => o.status === "pendiente" || o.status === "parcial");
  const overdueOrders = pendingOrders.filter((o) => o.expectedDate.seconds < now.getTime() / 1000);

  // KPI detail data
  const byClient  = computeByClient(sales).slice(0, 5);
  const invByValue = [...items].sort((a, b) => (b.currentStock * b.unitCost) - (a.currentStock * a.unitCost)).slice(0, 8);

  const criticalItems = items.filter((i) => getStockStatus(i) === "critical");
  const lowItems      = items.filter((i) => getStockStatus(i) === "low");

  const isEmpty = summary.numSales === 0 && items.length === 0;

  if (isEmpty) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de tu negocio en tiempo real" />
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Package size={48} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">¡Bienvenido a LogiAnalytics Pro!</h2>
          <p className="text-slate-500 mb-6">Sigue estos pasos para empezar:</p>
          <ol className="text-left inline-block text-sm text-slate-600 space-y-2">
            <li>1. <strong>Inventario</strong> — agrega tus productos con stock</li>
            <li>2. <strong>Ventas</strong> — registra tus primeras transacciones</li>
            <li>3. Vuelve aquí para ver métricas en tiempo real</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de tu negocio en tiempo real"
        action={
        <div className="flex items-center gap-2 flex-wrap">
          {!useCustom && <PeriodSelect value={period} onChange={setPeriod} />}
          {useCustom && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-slate-400 text-sm">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </>
          )}
          <button
            onClick={() => setUseCustom((v) => !v)}
            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${useCustom ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {useCustom ? "✕ Quitar rango" : "Personalizado"}
          </button>
          <button
            onClick={() => window.print()}
            title="Exportar PDF"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition print:hidden"
          >
            <Printer size={13} /> PDF
          </button>
        </div>
      }
      />

      {/* KPIs — clic para desglosar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-2">
        <KPICard label="Ingresos"          value={fmtCurrency(summary.revenue)}    icon={DollarSign}   color="indigo"
          delta={fmtDelta(revDelta)}
          deltaType={revDelta === null ? "neutral" : revDelta >= 0 ? "positive" : "negative"}
          onClick={() => setActiveKPI(activeKPI === "revenue" ? null : "revenue")}
          active={activeKPI === "revenue"}
        />
        <KPICard label="Ganancia"          value={fmtCurrency(summary.profit)}     icon={TrendingUp}   color="green"
          delta={profDelta !== null ? fmtDelta(profDelta) : `Margen ${fmt(marginPct, 1)}%`}
          deltaType={profDelta === null ? (marginPct >= 20 ? "positive" : marginPct >= 10 ? "neutral" : "negative") : profDelta >= 0 ? "positive" : "negative"}
          onClick={() => setActiveKPI(activeKPI === "profit" ? null : "profit")}
          active={activeKPI === "profit"}
        />
        <KPICard label="Ventas"            value={fmt(summary.numSales, 0)}        icon={ShoppingCart} color="blue"
          delta={`${fmt(summary.numSales / Math.max(period, 1), 1)} /día`}
          deltaType="neutral"
          onClick={() => setActiveKPI(activeKPI === "sales" ? null : "sales")}
          active={activeKPI === "sales"}
        />
        <KPICard label="Valor inventario"  value={fmtCurrency(invValue)}           icon={Package}      color="amber"
          delta={`${items.length} productos`}
          deltaType="neutral"
          onClick={() => setActiveKPI(activeKPI === "inventory" ? null : "inventory")}
          active={activeKPI === "inventory"}
        />
        <KPICard label="Alertas stock"
          value={`${criticalItems.length} crít · ${lowItems.length} bajos`}
          icon={AlertTriangle}
          color={criticalItems.length > 0 ? "red" : "green"}
          deltaType={criticalItems.length > 0 ? "negative" : "positive"}
          onClick={() => setActiveKPI(activeKPI === "alerts" ? null : "alerts")}
          active={activeKPI === "alerts"}
        />
      </div>

      {/* KPI detail panel */}
      {activeKPI && (
        <div className={`bg-white rounded-2xl border shadow-md p-5 mb-6 ${
          activeKPI === "revenue"   ? "border-indigo-200" :
          activeKPI === "profit"    ? "border-emerald-200" :
          activeKPI === "sales"     ? "border-blue-200" :
          activeKPI === "inventory" ? "border-amber-200" :
                                      "border-red-200"
        }`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${
                activeKPI === "revenue"   ? "bg-indigo-500" :
                activeKPI === "profit"    ? "bg-emerald-500" :
                activeKPI === "sales"     ? "bg-blue-500" :
                activeKPI === "inventory" ? "bg-amber-500" :
                                            "bg-red-500"
              }`} />
              {activeKPI === "revenue"   && `Desglose de ingresos — últimos ${period} días`}
              {activeKPI === "profit"    && `Desglose de ganancia — últimos ${period} días`}
              {activeKPI === "sales"     && `Desglose de ventas — últimos ${period} días`}
              {activeKPI === "inventory" && "Desglose de inventario por valor"}
              {activeKPI === "alerts"    && "Productos con stock bajo o crítico"}
            </h3>
            <button onClick={() => setActiveKPI(null)} className="text-slate-400 hover:text-slate-600 transition rounded-lg hover:bg-slate-100 p-1">
              <X size={16} />
            </button>
          </div>

          {/* INGRESOS */}
          {activeKPI === "revenue" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Mes actual</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(curRevenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Mes anterior</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(prevRevenue)}</p>
                </div>
                <div className={`rounded-xl p-3 ${revDelta !== null && revDelta >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                  <p className="text-xs text-slate-500 mb-1">Variación</p>
                  <p className={`font-bold ${revDelta !== null && revDelta >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {revDelta !== null ? `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Por ruta</p>
                <div className="space-y-1.5">
                  {routes.slice(0, 6).map((r) => (
                    <div key={r.route} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 truncate max-w-[140px]">{r.route || "Sin ruta"}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${summary.revenue > 0 ? (r.revenue / summary.revenue) * 100 : 0}%` }} />
                        </div>
                        <span className="font-medium text-slate-900 w-20 text-right">{fmtCurrency(r.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GANANCIA */}
          {activeKPI === "profit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Mes actual</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(curProfit)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Mes anterior</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(prevProfit)}</p>
                </div>
                <div className={`rounded-xl p-3 ${marginPct >= 20 ? "bg-emerald-50" : marginPct >= 10 ? "bg-amber-50" : "bg-red-50"}`}>
                  <p className="text-xs text-slate-500 mb-1">Margen</p>
                  <p className={`font-bold ${marginPct >= 20 ? "text-emerald-700" : marginPct >= 10 ? "text-amber-700" : "text-red-600"}`}>{fmt(marginPct, 1)}%</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Top productos por ganancia</p>
                <div className="space-y-1.5">
                  {products.slice(0, 6).map((p) => (
                    <div key={p.productName} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 truncate max-w-[140px]">{p.productName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{fmt(p.marginPct, 1)}% margen</span>
                        <span className="font-medium text-emerald-700 w-20 text-right">{fmtCurrency(p.profit)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VENTAS */}
          {activeKPI === "sales" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Total ventas</p>
                  <p className="font-bold text-slate-900">{fmt(summary.numSales, 0)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Promedio diario</p>
                  <p className="font-bold text-slate-900">{fmt(summary.numSales / Math.max(period, 1), 1)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Ticket promedio</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(summary.numSales > 0 ? summary.revenue / summary.numSales : 0)}</p>
                </div>
              </div>
              {byClient.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Top clientes</p>
                  <div className="space-y-1.5">
                    {byClient.map((c) => (
                      <div key={c.client} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 truncate max-w-[160px]">{c.client || "Sin cliente"}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-400">{c.numSales} ventas</span>
                          <span className="font-medium text-slate-900 w-20 text-right">{fmtCurrency(c.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INVENTARIO */}
          {activeKPI === "inventory" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Total productos</p>
                  <p className="font-bold text-slate-900">{items.length}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Valor total</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(invValue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Costo promedio</p>
                  <p className="font-bold text-slate-900">{fmtCurrency(items.length > 0 ? invValue / items.length : 0)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Productos de mayor valor</p>
                <div className="space-y-1.5">
                  {invByValue.map((i) => {
                    const val = i.currentStock * i.unitCost;
                    return (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 truncate max-w-[140px]">{i.name}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${invValue > 0 ? (val / invValue) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{i.currentStock} u.</span>
                          <span className="font-medium text-amber-700 w-20 text-right">{fmtCurrency(val)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ALERTAS */}
          {activeKPI === "alerts" && (
            <div className="space-y-2">
              {criticalItems.length === 0 && lowItems.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin alertas activas 🎉</p>
              )}
              {[...criticalItems, ...lowItems].map((i) => {
                const s = getStockStatus(i);
                return (
                  <div key={i.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-xl px-4 py-2.5">
                    <div>
                      <p className="font-medium text-slate-800">{i.name}</p>
                      <p className="text-xs text-slate-400">{i.category || "Sin categoría"} · SKU: {i.sku}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">Stock {i.currentStock} / mín {i.minStock}</span>
                      <StockBadge status={s} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-300 mb-6 text-center select-none">↑ clic en cualquier tarjeta para ver el desglose</p>

      {/* Stock alerts */}
      {(criticalItems.length > 0 || lowItems.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> {criticalItems.length + lowItems.length} alerta(s) de inventario
          </p>
          <div className="space-y-1.5">
            {[...criticalItems, ...lowItems].slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm text-red-800 bg-white/60 rounded-lg px-3 py-1.5">
                <span className="font-medium">{i.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">stock {i.currentStock} / mín {i.minStock}</span>
                  <StockBadge status={getStockStatus(i)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue trend */}
      {daily.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">Ingresos y ganancia — últimos {period} días</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${fmt(v)}`, ""]} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Ingresos" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit"  name="Ganancia" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Route + Product charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {routes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4">Ganancia por ruta ($)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={routes.slice(0, 8)} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="route" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Ganancia"]} />
                <Bar dataKey="profit" name="Ganancia" radius={[4, 4, 0, 0]}>
                  {routes.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {products.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4">Top 5 productos por ganancia</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={products.slice(0, 5)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="productName" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Ganancia"]} />
                <Bar dataKey="profit" name="Ganancia" radius={[0, 4, 4, 0]}>
                  {products.slice(0, 5).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Inventory status */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">Estado del inventario</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              {(() => {
                const statusData = [
                  { name: "🔴 Crítico", value: criticalItems.length,                     fill: "#ef4444" },
                  { name: "🟡 Bajo",    value: lowItems.length,                           fill: "#f59e0b" },
                  { name: "🟢 Óptimo",  value: items.length - criticalItems.length - lowItems.length, fill: "#10b981" },
                ].filter((d) => d.value > 0);
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                        {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
            <div className="space-y-2">
              {items.slice(0, 6).map((item) => {
                const s = getStockStatus(item);
                const pct = item.maxStock > 0 ? Math.min(100, (item.currentStock / item.maxStock) * 100) : 0;
                return (
                  <div key={item.id}>
                    <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                      <span className="truncate max-w-[140px]">{item.name}</span>
                      <span>{item.currentStock} / {item.maxStock}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={s === "critical" ? "bg-red-500" : s === "low" ? "bg-amber-400" : "bg-emerald-500"}
                        style={{ width: `${pct}%`, height: "100%", borderRadius: 9999 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 esta semana */}
      {topWeek.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6">
          <h3 className="font-semibold text-slate-700 mb-3">🔥 Top 5 productos esta semana</h3>
          <div className="space-y-2">
            {topWeek.map((p, i) => (
              <div key={p.productName} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-bold text-slate-300 w-4">#{i + 1}</span>
                <span className="flex-1 text-slate-700 truncate">{p.productName}</span>
                <span className="text-xs text-slate-400">{fmt(p.totalUnits, 0)} u.</span>
                <span className="font-semibold text-emerald-700 w-20 text-right">{fmtCurrency(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OC pendientes */}
      {pendingOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock size={15} className="text-amber-500" />
            Órdenes de compra pendientes
            {overdueOrders.length > 0 && (
              <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                {overdueOrders.length} vencida{overdueOrders.length !== 1 ? "s" : ""}
              </span>
            )}
          </h3>
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map((o) => {
              const overdue = o.expectedDate.seconds < now.getTime() / 1000;
              return (
                <div key={o.id} className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${overdue ? "bg-red-50" : "bg-slate-50"}`}>
                  <div>
                    <p className="font-medium text-slate-800">{o.orderNumber}</p>
                    <p className="text-xs text-slate-400">{o.supplierName}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${overdue ? "text-red-600" : "text-slate-500"}`}>
                      {fmtDate(o.expectedDate)}{overdue ? " ⚠️" : ""}
                    </p>
                    <p className="font-semibold text-slate-900">{fmtCurrency(o.total)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent sales */}
      {sales.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">Ventas recientes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  {["Fecha", "Producto", "Cant.", "Ruta", "Ingreso", "Ganancia"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 8).map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-500">{fmtDate(s.saleDate)}</td>
                    <td className="py-2 px-3 font-medium truncate max-w-[140px]">{s.productName}</td>
                    <td className="py-2 px-3">{s.quantity}</td>
                    <td className="py-2 px-3 text-slate-500">{s.route || "—"}</td>
                    <td className="py-2 px-3 text-indigo-600 font-medium">{fmtCurrency(s.totalRevenue)}</td>
                    <td className={`py-2 px-3 font-medium ${s.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmtCurrency(s.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
