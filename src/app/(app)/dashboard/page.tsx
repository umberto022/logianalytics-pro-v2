"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format, subDays, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell, PieChart, Pie,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Package, AlertTriangle, Printer, Clock,
  Wallet, CheckCircle2, XCircle, PackageCheck, ClipboardList,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useSales } from "@/hooks/useSales";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useRole } from "@/hooks/useRole";
import { useCaja } from "@/contexts/CajaContext";
import { getRecentSessions, type CajaSession } from "@/lib/firestore/caja";
import { computeSummary, computeByRoute, computeByProduct, computeDailyStats, computeByClient } from "@/lib/firestore/sales";
import { getStockStatus, fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { KPIDetailModal } from "@/components/ui/KPIDetailModal";
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

  const { role, workspaceId, can } = useRole();
  const isVentasOnly    = role === "ventas";    // employee, not admin — gets the minimal daily view
  const isComprasOnly   = role === "compras";
  const isLogisticaOnly = role === "logistica";
  const canViewSales = can("ventas").canView;
  const canViewInv   = can("inventario").canView;
  const canViewPO    = can("compras").canView || can("recepciones").canView;

  const [activeKPI, setActiveKPI] = useState<ActiveKPI>(null);
  const { items, loading: loadingInv } = useInventory(canViewInv && !isVentasOnly);
  const { sales: allSales, loading: loadingSales } = useSales(180, canViewSales);
  const { orders: purchaseOrders } = usePurchaseOrders(canViewPO && !isVentasOnly);

  const { session: cajaSession } = useCaja();
  const [todayClosedCaja, setTodayClosedCaja] = useState<CajaSession | null>(null);
  useEffect(() => {
    if (!isVentasOnly || !workspaceId) return;
    getRecentSessions(workspaceId).then((sessions) => {
      const today = new Date().toISOString().slice(0, 10);
      setTodayClosedCaja(sessions.find((s) => s.date === today && s.status === "closed") ?? null);
    });
  }, [isVentasOnly, workspaceId, cajaSession]);

  const todaySales   = useMemo(() => allSales.filter((s) => isSameDay(s.saleDate.toDate(), new Date())), [allSales]);
  const todaySummary = useMemo(() => computeSummary(todaySales), [todaySales]);

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

  const summary    = useMemo(() => computeSummary(sales),    [sales]);
  const routes     = useMemo(() => computeByRoute(sales),    [sales]);
  const products   = useMemo(() => computeByProduct(sales),  [sales]);
  const daily      = useMemo(() => computeDailyStats(sales), [sales]);
  const byClient   = useMemo(() => computeByClient(sales).slice(0, 5), [sales]);
  const invValue   = useMemo(() => items.reduce((s, i) => s + i.currentStock * i.unitCost, 0), [items]);
  const invByValue = useMemo(() => [...items].sort((a, b) => (b.currentStock * b.unitCost) - (a.currentStock * a.unitCost)).slice(0, 8), [items]);
  const criticalItems = useMemo(() => items.filter((i) => getStockStatus(i) === "critical"), [items]);
  const lowItems      = useMemo(() => items.filter((i) => getStockStatus(i) === "low"),      [items]);

  const mom = useMemo(() => {
    const now = new Date();
    const curMonthStart  = startOfMonth(now);
    const prevMonthStart = startOfMonth(subDays(curMonthStart, 1));
    const prevMonthEnd   = endOfMonth(prevMonthStart);
    const cur  = allSales.filter((s) => { const d = s.saleDate.toDate(); return d >= curMonthStart && d <= now; });
    const prev = allSales.filter((s) => { const d = s.saleDate.toDate(); return d >= prevMonthStart && d <= prevMonthEnd; });
    const curRev  = computeSummary(cur).revenue;
    const prevRev = computeSummary(prev).revenue;
    const curProfit  = computeSummary(cur).profit;
    const prevProfit = computeSummary(prev).profit;
    return {
      curRevenue: curRev,
      prevRevenue: prevRev,
      curProfit,
      prevProfit,
      revDelta:  prevRev  > 0 ? ((curRev  - prevRev)  / prevRev)  * 100 : null,
      profDelta: prevProfit > 0 ? ((curProfit - prevProfit) / prevProfit) * 100 : null,
    };
  }, [allSales]);

  const topWeek = useMemo(() => {
    const weekStart = subDays(new Date(), 7);
    return computeByProduct(allSales.filter((s) => s.saleDate.toDate() >= weekStart)).slice(0, 5);
  }, [allSales]);

  const { pendingOrders, overdueOrders } = useMemo(() => {
    const now = new Date();
    const pending  = purchaseOrders.filter((o) => o.status === "pendiente" || o.status === "parcial");
    const overdue  = pending.filter((o) => o.expectedDate.seconds < now.getTime() / 1000);
    return { pendingOrders: pending, overdueOrders: overdue };
  }, [purchaseOrders]);

  const receivedThisMonth = useMemo(() => {
    const now = new Date();
    return purchaseOrders.filter((o) => {
      if (o.status !== "recibida" || !o.receivedDate) return false;
      const d = o.receivedDate.toDate();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [purchaseOrders]);

  const fmtDelta = useCallback((d: number | null) =>
    d === null ? "vs mes ant." : `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs mes ant.`, []);

  const marginPct = summary.revenue > 0 ? summary.profit / summary.revenue * 100 : 0;
  const { revDelta, profDelta } = mom;

  const isEmpty =
    (!canViewSales || summary.numSales === 0) &&
    (!canViewInv || items.length === 0) &&
    (!canViewPO || purchaseOrders.length === 0);

  if (loadingInv || loadingSales) return <DashboardSkeleton />;

  if (isVentasOnly) {
    const cajaStatus = cajaSession
      ? { label: "Caja abierta", detail: `Abierta a las ${cajaSession.openedAt.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · inicial ${fmtCurrency(cajaSession.initialCash)}`, color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", icon: Wallet }
      : todayClosedCaja
        ? (todayClosedCaja.difference === 0
            ? { label: "Caja cuadrada", detail: `Cerrada a las ${todayClosedCaja.closedAt?.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) ?? ""}`, color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", icon: CheckCircle2 }
            : { label: "Caja con descuadre", detail: `Diferencia: ${fmtCurrency(todayClosedCaja.difference ?? 0)}`, color: "text-red-700 bg-red-50 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30", icon: XCircle })
        : { label: "Caja sin abrir hoy", detail: "Todavía no se ha abierto la caja del día", color: "text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-700", icon: Wallet };

    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de tu día" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KPICard label="Ventas hoy"   value={fmt(todaySummary.numSales, 0)}       icon={ShoppingCart} color="blue" deltaType="neutral" />
          <KPICard label="Ingresos hoy" value={fmtCurrency(todaySummary.revenue)}   icon={DollarSign}   color="indigo" deltaType="neutral" />
          <KPICard label="Ganancia hoy" value={fmtCurrency(todaySummary.profit)}    icon={TrendingUp}   color="green" deltaType="neutral" />
        </div>

        <div className={`rounded-2xl border p-5 mb-6 shadow-sm flex items-center gap-3 ${cajaStatus.color}`}>
          <cajaStatus.icon size={22} className="flex-shrink-0" />
          <div>
            <p className="font-semibold">{cajaStatus.label}</p>
            <p className="text-sm opacity-80">{cajaStatus.detail}</p>
          </div>
        </div>

        {todaySales.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <ShoppingCart size={40} className="text-slate-200 mx-auto mb-3 dark:text-slate-600" />
            <p className="text-slate-500 font-medium dark:text-slate-400">Sin ventas registradas hoy</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Ventas de hoy</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100 dark:text-slate-400 dark:border-slate-700">
                    {["Hora", "Producto", "Cant.", "Cliente", "Ingreso"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todaySales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/50">
                      <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{s.saleDate.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2 px-3 font-medium truncate max-w-[160px]">{s.productName}</td>
                      <td className="py-2 px-3">{s.quantity}</td>
                      <td className="py-2 px-3 text-slate-500 truncate max-w-[140px] dark:text-slate-400">{s.client || "—"}</td>
                      <td className="py-2 px-3 text-indigo-600 font-medium dark:text-indigo-400">{fmtCurrency(s.totalRevenue)}</td>
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

  if (isComprasOnly) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de tus órdenes de compra" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KPICard label="Órdenes pendientes" value={fmt(pendingOrders.length, 0)} icon={Clock} color={overdueOrders.length > 0 ? "red" : "blue"} deltaType="neutral"
            delta={overdueOrders.length > 0 ? `${overdueOrders.length} vencida${overdueOrders.length !== 1 ? "s" : ""}` : undefined} />
          <KPICard label="Recibidas este mes" value={fmt(receivedThisMonth.length, 0)} icon={PackageCheck} color="green" deltaType="neutral" />
          <KPICard label="Gastado este mes" value={fmtCurrency(receivedThisMonth.reduce((s, o) => s + o.total, 0))} icon={DollarSign} color="indigo" deltaType="neutral" />
        </div>

        {pendingOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <ClipboardList size={40} className="text-slate-200 mx-auto mb-3 dark:text-slate-600" />
            <p className="text-slate-500 font-medium dark:text-slate-400">Sin órdenes pendientes</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 dark:text-slate-200">
              <Clock size={15} className="text-amber-500" /> Órdenes de compra pendientes
            </h3>
            <div className="space-y-2">
              {pendingOrders.map((o) => {
                const overdue = o.expectedDate.seconds < Date.now() / 1000;
                return (
                  <div key={o.id} className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${overdue ? "bg-red-50 dark:bg-red-500/10" : "bg-slate-50 dark:bg-slate-700/40"}`}>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{o.orderNumber}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-400">{o.supplierName}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${overdue ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                        {fmtDate(o.expectedDate)}{overdue ? " ⚠️" : ""}
                      </p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(o.total)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLogisticaOnly) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de inventario y recepciones" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KPICard label="Alertas de stock" value={`${criticalItems.length} crít · ${lowItems.length} bajos`} icon={AlertTriangle}
            color={criticalItems.length > 0 ? "red" : "green"} deltaType="neutral" />
          <KPICard label="Productos en catálogo" value={fmt(items.length, 0)} icon={Package} color="amber" deltaType="neutral" />
          <KPICard label="Por recibir" value={fmt(pendingOrders.length, 0)} icon={PackageCheck}
            color={overdueOrders.length > 0 ? "red" : "blue"} deltaType="neutral"
            delta={overdueOrders.length > 0 ? `${overdueOrders.length} vencida${overdueOrders.length !== 1 ? "s" : ""}` : undefined} />
        </div>

        {(criticalItems.length > 0 || lowItems.length > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 dark:bg-red-500/10 dark:border-red-500/30">
            <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2 dark:text-red-300">
              <AlertTriangle size={16} /> {criticalItems.length + lowItems.length} alerta(s) de inventario
            </p>
            <div className="space-y-1.5">
              {[...criticalItems, ...lowItems].slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm text-red-800 bg-white/60 rounded-lg px-3 py-1.5 dark:text-red-300 dark:bg-slate-800/60">
                  <span className="font-medium">{i.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">stock {i.currentStock} / mín {i.minStock}</span>
                    <StockBadge status={getStockStatus(i)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <PackageCheck size={40} className="text-slate-200 mx-auto mb-3 dark:text-slate-600" />
            <p className="text-slate-500 font-medium dark:text-slate-400">Sin recepciones pendientes</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 dark:text-slate-200">
              <Clock size={15} className="text-amber-500" /> Pendientes de recepción
            </h3>
            <div className="space-y-2">
              {pendingOrders.map((o) => {
                const overdue = o.expectedDate.seconds < Date.now() / 1000;
                return (
                  <div key={o.id} className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${overdue ? "bg-red-50 dark:bg-red-500/10" : "bg-slate-50 dark:bg-slate-700/40"}`}>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{o.orderNumber}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-400">{o.supplierName}</p>
                    </div>
                    <p className={`text-xs font-semibold ${overdue ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {fmtDate(o.expectedDate)}{overdue ? " ⚠️" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de tu negocio en tiempo real" />
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center dark:bg-slate-800 dark:border-slate-700">
          <Package size={48} className="text-slate-300 mx-auto mb-4 dark:text-slate-600" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2 dark:text-slate-200">¡Bienvenido a LogiAnalytics Pro!</h2>
          <p className="text-slate-500 mb-6 dark:text-slate-400">Sigue estos pasos para empezar:</p>
          <ol className="text-left inline-block text-sm text-slate-600 space-y-2 dark:text-slate-400">
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
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
              <span className="text-slate-400 text-sm dark:text-slate-500">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
            </>
          )}
          <button
            onClick={() => setUseCustom((v) => !v)}
            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${useCustom ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {useCustom ? "✕ Quitar rango" : "Personalizado"}
          </button>
          <button
            onClick={() => window.print()}
            title="Exportar PDF"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition print:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer size={13} /> PDF
          </button>
        </div>
      }
      />

      {/* KPIs — clic abre modal de desglose */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {canViewSales && (
          <>
            <KPICard label="Ingresos"         value={fmtCurrency(summary.revenue)}                  icon={DollarSign}  color="indigo"
              delta={fmtDelta(revDelta)}
              deltaType={revDelta === null ? "neutral" : revDelta >= 0 ? "positive" : "negative"}
              onClick={() => setActiveKPI("revenue")}
            />
            <KPICard label="Ganancia"         value={fmtCurrency(summary.profit)}                   icon={TrendingUp}  color="green"
              delta={profDelta !== null ? fmtDelta(profDelta) : `Margen ${fmt(marginPct, 1)}%`}
              deltaType={profDelta === null ? (marginPct >= 20 ? "positive" : marginPct >= 10 ? "neutral" : "negative") : profDelta >= 0 ? "positive" : "negative"}
              onClick={() => setActiveKPI("profit")}
            />
            <KPICard label="Ventas"           value={fmt(summary.numSales, 0)}                      icon={ShoppingCart} color="blue"
              delta={`${fmt(summary.numSales / Math.max(period, 1), 1)} /día`}
              deltaType="neutral"
              onClick={() => setActiveKPI("sales")}
            />
          </>
        )}
        {canViewInv && (
          <>
            <KPICard label="Valor inventario" value={fmtCurrency(invValue)}                         icon={Package}     color="amber"
              delta={`${items.length} productos`}
              deltaType="neutral"
              onClick={() => setActiveKPI("inventory")}
            />
            <KPICard label="Alertas stock"
              value={`${criticalItems.length} crít · ${lowItems.length} bajos`}
              icon={AlertTriangle}
              color={criticalItems.length > 0 ? "red" : "green"}
              deltaType={criticalItems.length > 0 ? "negative" : "positive"}
              onClick={() => setActiveKPI("alerts")}
            />
          </>
        )}
      </div>

      {/* KPI detail modal */}
      {activeKPI && (
        <KPIDetailModal
          type={activeKPI}
          period={period}
          onClose={() => setActiveKPI(null)}
          summary={summary}
          routes={routes}
          products={products}
          byClient={byClient}
          items={items}
          invValue={invValue}
          invByValue={invByValue}
          criticalItems={criticalItems}
          lowItems={lowItems}
          marginPct={marginPct}
          curRevenue={mom.curRevenue}
          prevRevenue={mom.prevRevenue}
          curProfit={mom.curProfit}
          prevProfit={mom.prevProfit}
          revDelta={revDelta}
          profDelta={profDelta}
        />
      )}

      {/* Stock alerts */}
      {canViewInv && (criticalItems.length > 0 || lowItems.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 dark:bg-red-500/10 dark:border-red-500/30">
          <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2 dark:text-red-300">
            <AlertTriangle size={16} /> {criticalItems.length + lowItems.length} alerta(s) de inventario
          </p>
          <div className="space-y-1.5">
            {[...criticalItems, ...lowItems].slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm text-red-800 bg-white/60 rounded-lg px-3 py-1.5 dark:text-red-300 dark:bg-slate-800/60">
                <span className="font-medium">{i.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">stock {i.currentStock} / mín {i.minStock}</span>
                  <StockBadge status={getStockStatus(i)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue trend */}
      {canViewSales && daily.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Ingresos y ganancia — últimos {period} días</h3>
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
      {canViewSales && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {routes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Ganancia por ruta ($)</h3>
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
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Top 5 productos por ganancia</h3>
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
      )}

      {/* Inventory status */}
      {canViewInv && items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Estado del inventario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <div className="flex justify-between text-xs text-slate-600 mb-0.5 dark:text-slate-400">
                      <span className="truncate max-w-[140px]">{item.name}</span>
                      <span>{item.currentStock} / {item.maxStock}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-700">
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
      {canViewSales && topWeek.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 mb-3 dark:text-slate-200">🔥 Top 5 productos esta semana</h3>
          <div className="space-y-2">
            {topWeek.map((p, i) => (
              <div key={p.productName} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-bold text-slate-300 w-4 dark:text-slate-600">#{i + 1}</span>
                <span className="flex-1 text-slate-700 truncate dark:text-slate-200">{p.productName}</span>
                <span className="text-xs text-slate-400 dark:text-slate-400">{fmt(p.totalUnits, 0)} u.</span>
                <span className="font-semibold text-emerald-700 w-20 text-right dark:text-emerald-400">{fmtCurrency(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OC pendientes */}
      {canViewPO && pendingOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 dark:text-slate-200">
            <Clock size={15} className="text-amber-500" />
            Órdenes de compra pendientes
            {overdueOrders.length > 0 && (
              <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full dark:bg-red-500/15 dark:text-red-300">
                {overdueOrders.length} vencida{overdueOrders.length !== 1 ? "s" : ""}
              </span>
            )}
          </h3>
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map((o) => {
              const overdue = o.expectedDate.seconds < Date.now() / 1000;
              return (
                <div key={o.id} className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${overdue ? "bg-red-50 dark:bg-red-500/10" : "bg-slate-50 dark:bg-slate-700/40"}`}>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{o.orderNumber}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-400">{o.supplierName}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${overdue ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {fmtDate(o.expectedDate)}{overdue ? " ⚠️" : ""}
                    </p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(o.total)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent sales */}
      {canViewSales && sales.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 mb-4 dark:text-slate-200">Ventas recientes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100 dark:text-slate-400 dark:border-slate-700">
                  {["Fecha", "Producto", "Cant.", "Ruta", "Ingreso", "Ganancia"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 8).map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/50">
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{fmtDate(s.saleDate)}</td>
                    <td className="py-2 px-3 font-medium truncate max-w-[140px]">{s.productName}</td>
                    <td className="py-2 px-3">{s.quantity}</td>
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{s.route || "—"}</td>
                    <td className="py-2 px-3 text-indigo-600 font-medium dark:text-indigo-400">{fmtCurrency(s.totalRevenue)}</td>
                    <td className={`py-2 px-3 font-medium ${s.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
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
