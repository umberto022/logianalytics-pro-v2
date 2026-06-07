"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { MapPin, TrendingUp, Navigation, BarChart2, Plus, Edit2, Trash2, X, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getSales, computeByRoute } from "@/lib/firestore/sales";
import { listRoutes, addRoute, updateRoute, deleteRoute, type RouteRecord } from "@/lib/firestore/routes";
import { fmtCurrency, fmt } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { Period, RouteStats } from "@/types";

const RouteMap = dynamic(() => import("@/components/map/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-slate-100 rounded-2xl">
      <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

type Tab = "analytics" | "gestion";
const EMPTY_ROUTE = { name: "", zone: "", description: "", active: true };

export default function RutasPage() {
  const { user } = useAuth();
  const [tab,     setTab]    = useState<Tab>("analytics");
  const [period,  setPeriod] = useState<Period>(30);
  const [loading, setLoading]= useState(true);
  const [routes,  setRoutes] = useState<RouteStats[]>([]);
  const [selected,setSelected]= useState<string | null>(null);

  // CRUD state
  const [managed,      setManaged]      = useState<RouteRecord[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [editing,      setEditing]      = useState<RouteRecord | null>(null);
  const [form,         setForm]         = useState({ ...EMPTY_ROUTE });
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [sl, rr] = await Promise.all([getSales(user.uid, period), listRoutes(user.uid)]);
      setRoutes(computeByRoute(sl));
      setManaged(rr);
    } catch (e) {
      console.error("rutas load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name.trim() || !user) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateRoute(user.uid, editing.id, form);
        toast.success("Ruta actualizada");
      } else {
        await addRoute(user.uid, form);
        toast.success("Ruta creada");
      }
      await load();
      setShowForm(false);
      setEditing(null);
      setForm({ ...EMPTY_ROUTE });
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }

  async function handleDelete(r: RouteRecord) {
    if (!user || !confirm(`¿Eliminar la ruta "${r.name}"?`)) return;
    await deleteRoute(user.uid, r.id);
    toast.success("Ruta eliminada");
    await load();
  }

  function openEdit(r: RouteRecord) {
    setEditing(r);
    setForm({ name: r.name, zone: r.zone, description: r.description, active: r.active });
    setShowForm(true);
  }

  if (loading) return <FullPageSpinner />;

  const totalRevenue = routes.reduce((s, r) => s + r.revenue, 0);
  const totalProfit  = routes.reduce((s, r) => s + r.profit, 0);
  const best  = routes[0];
  const worst = routes[routes.length - 1];

  if (routes.length === 0) {
    return (
      <div>
        <PageHeader title="Rutas" subtitle="Visualiza el rendimiento de tus rutas de entrega" />
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <MapPin size={52} className="text-slate-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Sin datos de rutas</h2>
          <p className="text-slate-400 text-sm">Registra ventas indicando la <strong>Ruta</strong> para ver el mapa aquí.</p>
        </div>
      </div>
    );
  }

  const selectedRoute = routes.find((r) => r.route === selected);

  return (
    <div>
      {/* Route form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800">{editing ? "Editar ruta" : "Nueva ruta"}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ej. Ruta Norte" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Zona / Ciudad</label>
                <input value={form.zone} onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                  placeholder="ej. Santo Domingo Norte" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Clientes, días de visita, notas…" rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="w-4 h-4 rounded accent-brand-600" />
                <span className="text-sm font-medium text-slate-700">Ruta activa</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditing(null); }}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {saving ? "Guardando…" : (editing ? "Actualizar" : "Crear ruta")}
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Rutas"
        subtitle={`${routes.length} ruta${routes.length !== 1 ? "s" : ""} activa${routes.length !== 1 ? "s" : ""} con datos de ventas`}
        action={tab === "analytics" ? <PeriodSelect value={period} onChange={setPeriod} /> : (
          <button onClick={() => { setEditing(null); setForm({ ...EMPTY_ROUTE }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition">
            <Plus size={15} /> Nueva ruta
          </button>
        )}
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {([["analytics", "📊 Analíticas"], ["gestion", "🗺️ Mis rutas"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${tab === key ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Gestión CRUD ── */}
      {tab === "gestion" && (
        <div>
          {managed.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <MapPin size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 font-medium">No tienes rutas creadas</p>
              <p className="text-slate-400 text-sm mt-1 mb-5">Crea rutas para organizar tus áreas de distribución</p>
              <button onClick={() => { setEditing(null); setForm({ ...EMPTY_ROUTE }); setShowForm(true); }}
                className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition">
                Crear primera ruta
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                    {["Nombre", "Zona", "Estado", "Descripción", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managed.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                        <MapPin size={14} className="text-brand-500 flex-shrink-0" />{r.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.zone || "—"}</td>
                      <td className="px-4 py-3">
                        {r.active
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle2 size={10}/> Activa</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Inactiva</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.description || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Analíticas ── */}
      {tab === "analytics" && (<div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Rutas activas"    value={String(routes.length)}     color="indigo" icon={MapPin}    />
        <KPICard label="Ingresos totales" value={fmtCurrency(totalRevenue)} color="blue"   icon={TrendingUp} />
        <KPICard label="Ganancia total"   value={fmtCurrency(totalProfit)}  color="green"  icon={BarChart2}  />
        {best && (
          <KPICard
            label="Mejor ruta"
            value={best.route}
            delta={`${best.marginPct}% margen`}
            deltaType="positive"
            color="green"
            icon={Navigation}
          />
        )}
      </div>

      {/* Map + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Map */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          style={{ height: 440 }}
        >
          <RouteMap routes={routes} />
        </div>

        {/* Ranking list */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <h3 className="font-semibold text-slate-700 text-sm">Ranking por ganancia</h3>
            <p className="text-xs text-slate-400 mt-0.5">Clic para ver detalle</p>
          </div>
          <div className="overflow-y-auto flex-1">
            {routes.map((r, i) => {
              const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
              const active = selected === r.route;
              return (
                <button
                  key={r.route}
                  onClick={() => setSelected(active ? null : r.route)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-all ${active ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-300 w-5 flex-shrink-0">#{i + 1}</span>
                      <span className="text-sm font-semibold text-slate-700 truncate">{r.route}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-1 ${
                      r.marginPct >= 20 ? "bg-emerald-100 text-emerald-700"
                      : r.marginPct >= 10 ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"}`}>
                      {r.marginPct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{fmtCurrency(r.profit)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected route detail panel */}
      {selectedRoute && (
        <div className="bg-white rounded-2xl border border-brand-200 p-5 shadow-sm mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <MapPin size={16} className="text-brand-500" />
              {selectedRoute.route}
            </h3>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition">
              ✕ cerrar
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Ventas",    value: String(selectedRoute.numSales) },
              { label: "Unidades", value: fmt(selectedRoute.totalUnits, 0) },
              { label: "Ingresos", value: fmtCurrency(selectedRoute.revenue) },
              { label: "Costo",    value: fmtCurrency(selectedRoute.cost) },
              { label: "Ganancia", value: fmtCurrency(selectedRoute.profit) },
              { label: "Margen",   value: `${selectedRoute.marginPct}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className="font-bold text-slate-800 text-sm">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert banners */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {best && (
          <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
            <strong>Mejor ruta:</strong> {best.route} — Ganancia {fmtCurrency(best.profit)} · Margen {best.marginPct}%
          </div>
        )}
        {worst && worst !== best && worst.marginPct < 10 && (
          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Atención:</strong> {worst.route} tiene solo {worst.marginPct}% de margen — considera revisarla.
          </div>
        )}
      </div>

      {/* Full table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">Tabla completa</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                {["#", "Ruta", "Ventas", "Unidades", "Ingresos", "Costo", "Ganancia", "Margen %"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => (
                <tr
                  key={r.route}
                  className={`border-t border-slate-50 cursor-pointer transition-colors ${selected === r.route ? "bg-brand-50" : "hover:bg-slate-50"}`}
                  onClick={() => setSelected(selected === r.route ? null : r.route)}
                >
                  <td className="py-2.5 px-4 text-slate-300 font-bold">#{i + 1}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{r.route}</td>
                  <td className="py-2.5 px-4">{r.numSales}</td>
                  <td className="py-2.5 px-4">{fmt(r.totalUnits, 0)}</td>
                  <td className="py-2.5 px-4 text-indigo-600 font-medium">{fmtCurrency(r.revenue)}</td>
                  <td className="py-2.5 px-4 text-red-500">{fmtCurrency(r.cost)}</td>
                  <td className="py-2.5 px-4 text-emerald-600 font-semibold">{fmtCurrency(r.profit)}</td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      r.marginPct >= 20 ? "bg-emerald-100 text-emerald-700"
                      : r.marginPct >= 10 ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"}`}>
                      {r.marginPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>)}
    </div>
  );
}
