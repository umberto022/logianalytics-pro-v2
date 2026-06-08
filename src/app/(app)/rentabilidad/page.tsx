"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, Cell, Treemap,
  PieChart, Pie,
} from "recharts";
import { TrendingUp, CalendarRange } from "lucide-react";
import { computeSummary, computeByRoute, computeByProduct } from "@/lib/firestore/sales";
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { fmtCurrency, fmt, fmtDatetime } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { Period, Sale, RouteStats, ProductStats, InventoryMovement } from "@/types";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];
type Tab = "routes" | "products" | "movements";
type DateMode = "preset" | "custom";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function RentabilidadPage() {
  const [period,   setPeriod]  = useState<Period>(30);
  const [dateMode, setDateMode] = useState<DateMode>("preset");
  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate,   setToDate]   = useState(todayStr());
  const [tab,      setTab]      = useState<Tab>("routes");

  const { sales, movements, loading } = useRentabilidad(dateMode, period, fromDate, toDate);

  const summary  = computeSummary(sales);
  const routes   = computeByRoute(sales);
  const products = computeByProduct(sales);
  const margin   = summary.revenue > 0 ? summary.profit / summary.revenue * 100 : 0;

  if (loading) return <FullPageSpinner />;

  if (summary.numSales === 0) {
    return (
      <div>
        <PageHeader title="Rentabilidad" subtitle="Analiza rutas, productos y márgenes" action={<PeriodSelect value={period} onChange={(p) => { setPeriod(p); setDateMode("preset"); }} />} />
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <TrendingUp size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No hay ventas en este período.</p>
          <p className="text-sm text-slate-400 mt-1">Ve a <strong>Ventas</strong> para registrar transacciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rentabilidad"
        subtitle="Analiza qué rutas, productos y zonas generan más ganancia"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setDateMode("preset")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${dateMode === "preset" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
              >
                Período
              </button>
              <button
                onClick={() => setDateMode("custom")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${dateMode === "custom" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
              >
                <CalendarRange size={12} /> Personalizado
              </button>
            </div>
            {dateMode === "preset" ? (
              <PeriodSelect value={period} onChange={setPeriod} />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date" value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-400">—</span>
                <input
                  type="date" value={toDate}
                  min={fromDate}
                  max={todayStr()}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard label="Ventas"             value={fmt(summary.numSales, 0)}      color="indigo" />
        <KPICard label="Unidades vendidas"  value={fmt(summary.totalUnits, 0)}    color="blue"   />
        <KPICard label="Ingresos totales"   value={fmtCurrency(summary.revenue)}  color="green"  />
        <KPICard label="Costo total"        value={fmtCurrency(summary.cost)}     color="amber"  />
        <KPICard label="Ganancia / Margen"  value={fmtCurrency(summary.profit)}
          delta={`${fmt(margin, 1)}% margen`}
          deltaType={margin >= 20 ? "positive" : margin >= 10 ? "neutral" : "negative"}
          color="green"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {([
          { key: "routes",    label: "🗺️ Por ruta"     },
          { key: "products",  label: "📦 Por producto" },
          { key: "movements", label: "🔄 Movimientos"  },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === key ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Routes tab */}
      {tab === "routes" && (
        <div className="space-y-6">
          {routes.length === 0 ? (
            <p className="text-slate-400 text-sm">Sin datos de rutas para este período.</p>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                Mejor ruta: <strong>{routes[0].route}</strong> — Ganancia <strong>{fmtCurrency(routes[0].profit)}</strong> | Margen <strong>{routes[0].marginPct}%</strong>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-4">Ingresos, costo y ganancia por ruta</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={routes.slice(0, 8)} margin={{ top: 4, right: 8, bottom: 25, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="route" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v: number) => `$${fmt(v)}`} />
                      <Legend />
                      <Bar dataKey="revenue" name="Ingresos" fill="#6366f1" radius={[3,3,0,0]} />
                      <Bar dataKey="cost"    name="Costo"    fill="#f87171" radius={[3,3,0,0]} />
                      <Bar dataKey="profit"  name="Ganancia" fill="#10b981" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-4">Distribución de unidades por ruta</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={routes} dataKey="totalUnits" nameKey="route" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.route} (${e.totalUnits})`} labelLine={false}>
                        {routes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 bg-slate-50">
                        {["Ruta", "Ventas", "Unidades", "Ingresos", "Costo", "Ganancia", "Margen %"].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => (
                        <tr key={r.route} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-medium">{r.route}</td>
                          <td className="py-2.5 px-4">{r.numSales}</td>
                          <td className="py-2.5 px-4">{fmt(r.totalUnits, 0)}</td>
                          <td className="py-2.5 px-4 text-indigo-600">{fmtCurrency(r.revenue)}</td>
                          <td className="py-2.5 px-4 text-red-500">{fmtCurrency(r.cost)}</td>
                          <td className="py-2.5 px-4 text-emerald-600 font-medium">{fmtCurrency(r.profit)}</td>
                          <td className="py-2.5 px-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.marginPct >= 20 ? "bg-emerald-100 text-emerald-700" : r.marginPct >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {r.marginPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Products tab */}
      {tab === "products" && (
        <div className="space-y-6">
          {products.length === 0 ? (
            <p className="text-slate-400 text-sm">Sin datos de productos para este período.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                  Mejor producto: <strong>{products[0].productName}</strong> — Ganancia <strong>{fmtCurrency(products[0].profit)}</strong> | Margen <strong>{products[0].marginPct}%</strong>
                </div>
                {products.length > 1 && products[products.length - 1].marginPct < 10 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    Menor margen: <strong>{products[products.length - 1].productName}</strong> — {products[products.length - 1].marginPct}%
                  </div>
                )}
              </div>

              {/* Treemap */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 mb-4">Mapa de ingresos por categoría y producto</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <Treemap
                    data={products.map((p) => ({ name: p.productName, size: p.revenue, margin: p.marginPct }))}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#fff"
                    content={((props: any) => {
                      const { x, y, width, height, name, margin: mg } = props;
                      const bg = (mg ?? 0) >= 25 ? "#10b981" : (mg ?? 0) >= 15 ? "#f59e0b" : "#ef4444";
                      return (
                        <g>
                          <rect x={x} y={y} width={width} height={height} fill={bg} stroke="#fff" strokeWidth={2} rx={4} />
                          {width > 60 && height > 30 && (
                            <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
                              {name}
                            </text>
                          )}
                        </g>
                      );
                    }) as any}
                  />
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-4">Top 10 por ganancia</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="productName" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip formatter={(v: number) => `$${fmt(v)}`} />
                      <Bar dataKey="profit" name="Ganancia" radius={[0, 4, 4, 0]}>
                        {products.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-4">Unidades vs Ganancia</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="totalUnits" name="Unidades" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="profit" name="Ganancia" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: number) => fmt(v)} />
                      <Scatter data={products} fill="#6366f1">
                        {products.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 bg-slate-50">
                        {["SKU", "Producto", "Categoría", "Ventas", "Unidades", "Ingresos", "Costo", "Ganancia", "Margen %"].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.sku} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                          <td className="py-2.5 px-4 font-medium">{p.productName}</td>
                          <td className="py-2.5 px-4 text-slate-500">{p.category}</td>
                          <td className="py-2.5 px-4">{p.numSales}</td>
                          <td className="py-2.5 px-4">{fmt(p.totalUnits, 0)}</td>
                          <td className="py-2.5 px-4 text-indigo-600">{fmtCurrency(p.revenue)}</td>
                          <td className="py-2.5 px-4 text-red-500">{fmtCurrency(p.cost)}</td>
                          <td className="py-2.5 px-4 text-emerald-600 font-medium">{fmtCurrency(p.profit)}</td>
                          <td className="py-2.5 px-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.marginPct >= 20 ? "bg-emerald-100 text-emerald-700" : p.marginPct >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {p.marginPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Movements tab */}
      {tab === "movements" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {movements.length === 0 ? (
            <div className="text-center py-16 text-slate-400">Sin movimientos en este período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50">
                    {["Fecha", "Tipo", "SKU", "Producto", "Cantidad", "Referencia", "Nota"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{fmtDatetime(m.createdAt)}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.movementType === "sale"     ? "bg-red-100 text-red-700" :
                          m.movementType === "purchase" ? "bg-emerald-100 text-emerald-700" :
                          "bg-amber-100 text-amber-700"}`}>
                          {m.movementType === "sale" ? "🔴 Venta" : m.movementType === "purchase" ? "🟢 Compra" : "🟡 Ajuste"}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{m.sku}</td>
                      <td className="py-2.5 px-4 font-medium">{m.productName}</td>
                      <td className={`py-2.5 px-4 font-semibold ${m.quantity < 0 ? "text-red-500" : "text-emerald-600"}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{m.reference || "—"}</td>
                      <td className="py-2.5 px-4 text-slate-500 text-xs">{m.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
