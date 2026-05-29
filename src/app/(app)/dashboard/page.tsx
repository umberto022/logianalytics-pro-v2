"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Treemap, Cell, PieChart, Pie,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Package, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";
import { getSales, computeSummary, computeByRoute, computeByProduct, computeDailyStats } from "@/lib/firestore/sales";
import { getStockStatus, fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StockBadge } from "@/components/ui/StockBadge";
import type { Period, InventoryItem, Sale, RouteStats, ProductStats, DailyStat, SalesSummary } from "@/types";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

export default function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod]     = useState<Period>(30);
  const [loading, setLoading]   = useState(true);
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [sales, setSales]       = useState<Sale[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [inv, sl] = await Promise.all([
      listInventory(user.uid),
      getSales(user.uid, period),
    ]);
    setItems(inv);
    setSales(sl);
    setLoading(false);
  }, [user, period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <FullPageSpinner />;

  const summary: SalesSummary = computeSummary(sales);
  const routes:  RouteStats[] = computeByRoute(sales);
  const products: ProductStats[] = computeByProduct(sales);
  const daily:   DailyStat[]  = computeDailyStats(sales);

  const marginPct = summary.revenue > 0 ? summary.profit / summary.revenue * 100 : 0;
  const invValue  = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);

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
        action={<PeriodSelect value={period} onChange={setPeriod} />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard label="Ingresos"          value={fmtCurrency(summary.revenue)}    icon={DollarSign}   color="indigo" />
        <KPICard label="Ganancia"          value={fmtCurrency(summary.profit)}     icon={TrendingUp}   color="green"
          delta={`Margen ${fmt(marginPct, 1)}%`}
          deltaType={marginPct >= 20 ? "positive" : marginPct >= 10 ? "neutral" : "negative"}
        />
        <KPICard label="Ventas"            value={fmt(summary.numSales, 0)}        icon={ShoppingCart} color="blue"  />
        <KPICard label="Valor inventario"  value={fmtCurrency(invValue)}           icon={Package}      color="amber" />
        <KPICard label="Alertas stock"
          value={`${criticalItems.length} crít · ${lowItems.length} bajos`}
          icon={AlertTriangle}
          color={criticalItems.length > 0 ? "red" : "green"}
          deltaType={criticalItems.length > 0 ? "negative" : "positive"}
        />
      </div>

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
