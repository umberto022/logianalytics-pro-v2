"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ShoppingCart, Download } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import Papa from "papaparse";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";
import { registerSale, getSales, computeSummary, computeDailyStats } from "@/lib/firestore/sales";
import { fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { InventoryItem, Sale, Period } from "@/types";

type Tab = "register" | "history";

export default function VentasPage() {
  const { user } = useAuth();
  const [tab,     setTab]     = useState<Tab>("register");
  const [items,   setItems]   = useState<InventoryItem[]>([]);
  const [sales,   setSales]   = useState<Sale[]>([]);
  const [period,  setPeriod]  = useState<Period>(30);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [form, setForm] = useState({
    inventoryId: "",
    quantity: 1,
    unitPrice: 0,
    route: "",
    zone: "",
    client: "",
    saleDate: format(new Date(), "yyyy-MM-dd"),
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [inv, sl] = await Promise.all([
        listInventory(user.uid),
        getSales(user.uid, period),
      ]);
      setItems(inv);
      setSales(sl);
      if (inv.length && !form.inventoryId) {
        setForm((p) => ({ ...p, inventoryId: inv[0].id, unitPrice: inv[0].salePrice }));
      }
    } catch (e) {
      console.error("ventas load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user, period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const selectedItem = items.find((i) => i.id === form.inventoryId);

  function handleSelectProduct(e: React.ChangeEvent<HTMLSelectElement>) {
    const item = items.find((i) => i.id === e.target.value);
    setForm((p) => ({
      ...p,
      inventoryId: e.target.value,
      unitPrice: item?.salePrice ?? 0,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inventoryId) { toast.error("Selecciona un producto"); return; }
    if (!user) return;
    setSaving(true);
    const r = await registerSale(user.uid, {
      inventoryId: form.inventoryId,
      quantity: form.quantity,
      unitPrice: form.unitPrice,
      route: form.route,
      zone: form.zone,
      client: form.client,
      saleDate: new Date(form.saleDate),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      setForm((p) => ({ ...p, quantity: 1, route: "", zone: "", client: "" }));
      await load();
    } else {
      toast.error(r.message);
    }
  }

  function exportCSV() {
    const csv = Papa.unparse(sales.map((s) => ({
      fecha: fmtDate(s.saleDate),
      producto: s.productName,
      sku: s.sku,
      cantidad: s.quantity,
      precio_unitario: s.unitPrice,
      ruta: s.route,
      zona: s.zone,
      cliente: s.client,
      ingreso: s.totalRevenue,
      costo: s.totalCost,
      ganancia: s.profit,
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `ventas_${period}d.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const summary = computeSummary(sales);
  const daily   = computeDailyStats(sales);

  // Computed preview
  const total  = form.quantity * form.unitPrice;
  const cost   = form.quantity * (selectedItem?.unitCost ?? 0);
  const profit = total - cost;
  const pct    = total > 0 ? profit / total * 100 : 0;

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Registra transacciones y analiza tu historial" />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {(["register", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === t ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}>
            {t === "register" ? "✏️ Registrar venta" : `📋 Historial (${sales.length})`}
          </button>
        ))}
      </div>

      {/* Register tab */}
      {tab === "register" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-5">Nueva venta</h2>

            {items.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <ShoppingCart size={40} className="mx-auto mb-3" />
                <p>No tienes productos en inventario.</p>
                <p className="text-sm mt-1">Ve a <strong>Inventario</strong> para agregar productos primero.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Producto *</label>
                  <select value={form.inventoryId} onChange={handleSelectProduct}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}{i.color ? ` · ${i.color}` : ""} [{i.category}] — stock: {i.currentStock}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad *</label>
                    <input type="number" min={1} max={selectedItem?.currentStock}
                      value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    {selectedItem && <p className="text-xs text-slate-400 mt-1">Stock disponible: {selectedItem.currentStock}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Precio unitario ($) *</label>
                    <input type="number" min={0.01} step="0.01"
                      value={form.unitPrice} onChange={(e) => setForm((p) => ({ ...p, unitPrice: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ruta</label>
                    <input value={form.route} placeholder="ej. Norte, Sur, Zona Centro"
                      onChange={(e) => setForm((p) => ({ ...p, route: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zona / Ciudad</label>
                    <input value={form.zone} placeholder="ej. Caracas, Medellín"
                      onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                    <input value={form.client} placeholder="Nombre o código"
                      onChange={(e) => setForm((p) => ({ ...p, client: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de venta</label>
                    <input type="date" value={form.saleDate}
                      onChange={(e) => setForm((p) => ({ ...p, saleDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>

                <button type="submit" disabled={saving}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                  {saving ? "Registrando…" : "✅ Registrar venta"}
                </button>
              </form>
            )}
          </div>

          {/* Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-700 mb-4">Vista previa</h3>
              <div className="space-y-3">
                {[
                  { label: "Total venta",  value: fmtCurrency(total),  color: "text-indigo-600" },
                  { label: "Costo total",  value: fmtCurrency(cost),   color: "text-red-500" },
                  { label: "Ganancia",     value: fmtCurrency(profit), color: profit >= 0 ? "text-emerald-600" : "text-red-500" },
                  { label: "Margen",       value: `${fmt(pct, 1)}%`,   color: pct >= 20 ? "text-emerald-600" : pct >= 10 ? "text-amber-500" : "text-red-500" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">{label}</span>
                    <span className={`font-semibold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-medium text-slate-500 mb-3">ÚLTIMOS {period} DÍAS</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ventas</span>
                  <span className="font-medium">{summary.numSales}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ingresos</span>
                  <span className="font-medium text-indigo-600">{fmtCurrency(summary.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ganancia</span>
                  <span className="font-medium text-emerald-600">{fmtCurrency(summary.profit)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <PeriodSelect value={period} onChange={setPeriod} />
            {sales.length > 0 && (
              <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                <Download size={15} /> Exportar CSV
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard label="Ventas"           value={fmt(summary.numSales, 0)}     color="indigo" />
            <KPICard label="Ingresos totales" value={fmtCurrency(summary.revenue)} color="blue"   />
            <KPICard label="Costo total"      value={fmtCurrency(summary.cost)}    color="amber"  />
            <KPICard label="Ganancia total"   value={fmtCurrency(summary.profit)}  color="green"  />
          </div>

          {daily.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6">
              <h3 className="font-semibold text-slate-700 mb-4">Tendencia de ventas</h3>
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

          {sales.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <ShoppingCart size={40} className="mx-auto mb-3" />
              <p>No hay ventas en este período</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50">
                      {["Fecha", "Producto", "SKU", "Cant.", "Precio u.", "Ruta", "Zona", "Cliente", "Ingreso", "Ganancia"].map((h) => (
                        <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{fmtDate(s.saleDate)}</td>
                        <td className="py-2.5 px-4 font-medium truncate max-w-[140px]">{s.productName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{s.sku}</td>
                        <td className="py-2.5 px-4">{s.quantity}</td>
                        <td className="py-2.5 px-4">{fmtCurrency(s.unitPrice)}</td>
                        <td className="py-2.5 px-4 text-slate-500">{s.route || "—"}</td>
                        <td className="py-2.5 px-4 text-slate-500">{s.zone || "—"}</td>
                        <td className="py-2.5 px-4 text-slate-500">{s.client || "—"}</td>
                        <td className="py-2.5 px-4 text-indigo-600 font-medium">{fmtCurrency(s.totalRevenue)}</td>
                        <td className={`py-2.5 px-4 font-medium ${s.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
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
      )}
    </div>
  );
}
