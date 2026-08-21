"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  Store, Plus, Edit2, Trash2, X, CheckCircle2, Search,
  Phone, Mail, MapPin, FileText, Download, BarChart2,
  ShoppingBag, DollarSign, Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import {
  addSupplier, updateSupplier, deleteSupplier, type Supplier,
} from "@/lib/firestore/suppliers";
import { listPurchaseOrders } from "@/lib/firestore/purchases";
import { supplierSchema, zodErrors } from "@/lib/schemas";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AdminButton } from "@/components/ui/AdminOnly";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { fmtCurrency } from "@/lib/utils";
import { useSuppliers, useInvalidateSuppliers } from "@/hooks/useSuppliers";
import type { PurchaseOrder } from "@/types";

const EMPTY: Omit<Supplier, "id" | "createdAt"> = {
  name: "", rnc: "", phone: "", email: "", address: "", notes: "", active: true,
};

interface SupplierPerf {
  orders: PurchaseOrder[];
  totalSpent: number;
  onTimeRate: number;
}

export default function ProveedoresPage() {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const { suppliers, loading, refetch } = useSuppliers();
  const invalidate = useInvalidateSuppliers();
  const [search,    setSearch]    = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState<Supplier | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);
  const [perfSupplier, setPerfSupplier] = useState<Supplier | null>(null);
  const [perfData,     setPerfData]     = useState<SupplierPerf | null>(null);
  const [perfLoading,  setPerfLoading]  = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setFormErrors({});
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, rnc: s.rnc, phone: s.phone, email: s.email, address: s.address, notes: s.notes, active: s.active });
    setFormErrors({});
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = supplierSchema.safeParse(form);
    if (!parsed.success) {
      setFormErrors(zodErrors(parsed));
      toast.error("Corrige los errores del formulario");
      return;
    }
    setFormErrors({});
    setSaving(true);
    const r = editing
      ? await updateSupplier(workspaceId, editing.id, parsed.data)
      : await addSupplier(workspaceId, parsed.data);
    setSaving(false);
    if (r.ok) { toast.success(r.message); invalidate(); setShowForm(false); }
    else toast.error(r.message);
  }

  function handleDelete(s: Supplier) {
    setConfirmDelete(s);
  }

  async function doDelete() {
    if (!user || !confirmDelete) return;
    const s = confirmDelete;
    setConfirmDelete(null);
    const r = await deleteSupplier(workspaceId, s.id);
    if (r.ok) { toast.success(r.message); invalidate(); }
    else toast.error(r.message);
  }

  async function openPerf(s: Supplier) {
    if (!user) return;
    setPerfSupplier(s);
    setPerfData(null);
    setPerfLoading(true);
    try {
      const allOrders = await listPurchaseOrders(workspaceId);
      const orders = allOrders.filter((o) =>
        o.supplierId === s.id || o.supplierName.toLowerCase() === s.name.toLowerCase()
      );
      const completed = orders.filter((o) => o.status === "recibida");
      const totalSpent = completed.reduce((sum, o) => sum + o.total, 0);
      const onTime = completed.filter((o) => {
        if (!o.receivedDate || !o.expectedDate) return false;
        return o.receivedDate.seconds <= o.expectedDate.seconds;
      }).length;
      const onTimeRate = completed.length > 0 ? (onTime / completed.length) * 100 : 0;
      setPerfData({ orders, totalSpent, onTimeRate });
    } catch {
      toast.error("Error al cargar historial");
    } finally {
      setPerfLoading(false);
    }
  }

  function exportCSV() {
    const rows = suppliers.map((s) =>
      [s.name, s.rnc, s.phone, s.email, s.address, s.active ? "Activo" : "Inactivo"].join(",")
    );
    const csv = "﻿" + "Nombre,RNC,Teléfono,Email,Dirección,Estado\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "proveedores.csv";
    a.click();
  }

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.rnc.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const total  = suppliers.length;
  const active = suppliers.filter((s) => s.active).length;

  const inp = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";

  if (loading) return <div className="space-y-5"><TableSkeleton rows={5} cols={5} /></div>;

  return (
    <div>
      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Nombre *",        key: "name"  as const, placeholder: "ej. Distribuidora ABC" },
                  { label: "RNC / ID fiscal", key: "rnc"   as const, placeholder: "ej. 1-31-12345-6" },
                  { label: "Teléfono",        key: "phone" as const, placeholder: "809-555-0000" },
                  { label: "Email",           key: "email" as const, placeholder: "compras@abc.com" },
                ]).map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">{label}</label>
                    <input value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className={`${inp} ${formErrors[key] ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                    {formErrors[key] && <p className="text-xs text-red-500 mt-0.5">{formErrors[key]}</p>}
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Dirección</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Calle, ciudad, país"
                  className={`${inp} border-slate-200 dark:border-slate-700`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Notas internas</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Condiciones de pago, contacto, observaciones…" rows={2}
                  className={`${inp} border-slate-200 resize-none dark:border-slate-700`} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="w-4 h-4 rounded accent-brand-600" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Proveedor activo</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {saving ? "Guardando…" : editing ? "Actualizar" : "Crear proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Performance modal */}
      {perfSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPerfSupplier(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg dark:bg-slate-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100">{perfSupplier.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Historial de performance</p>
              </div>
              <button onClick={() => setPerfSupplier(null)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              {perfLoading ? (
                <div className="py-10 text-center text-slate-400 text-sm">Cargando datos…</div>
              ) : perfData ? (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: "Órdenes", value: perfData.orders.length, icon: ShoppingBag, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300" },
                      { label: "Total comprado", value: fmtCurrency(perfData.totalSpent), icon: DollarSign, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" },
                      { label: "A tiempo", value: `${Math.round(perfData.onTimeRate)}%`, icon: Clock, color: perfData.onTimeRate >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" : "text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3 text-center dark:bg-slate-700/40">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1 ${color}`}>
                          <Icon size={15} />
                        </div>
                        <p className="text-xs text-slate-500 mb-0.5 dark:text-slate-400">{label}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</p>
                      </div>
                    ))}
                  </div>

                  {perfData.orders.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-4">Sin órdenes de compra registradas para este proveedor.</p>
                  ) : (
                    <div className="rounded-xl border border-slate-100 overflow-hidden dark:border-slate-700">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400">
                            <th className="text-left px-3 py-2 font-medium">N° Orden</th>
                            <th className="text-left px-3 py-2 font-medium">Fecha</th>
                            <th className="text-right px-3 py-2 font-medium">Total</th>
                            <th className="text-center px-3 py-2 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {perfData.orders.slice(0, 10).map((o) => (
                            <tr key={o.id} className="border-t border-slate-50 dark:border-slate-700/50">
                              <td className="px-3 py-2 font-mono text-brand-600 dark:text-brand-400">{o.orderNumber}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                {o.createdAt?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }) ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(o.total)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                                  o.status === "recibida" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
                                  o.status === "parcial"  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" :
                                  o.status === "cancelada" ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" :
                                  "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                }`}>
                                  {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {perfData.orders.length > 10 && (
                        <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-100 dark:bg-slate-700/40 dark:border-slate-700">
                          Mostrando 10 de {perfData.orders.length} órdenes
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Eliminar proveedor"
        description={`¿Estás seguro de que deseas eliminar "${confirmDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <PageHeader
        title="Proveedores"
        subtitle={`${total} proveedor${total !== 1 ? "es" : ""} · ${active} activo${active !== 1 ? "s" : ""}`}
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Download size={14} /> CSV
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition">
              <Plus size={15} /> Nuevo proveedor
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total",     value: total,             color: "text-slate-800 dark:text-slate-100",   bg: "bg-white dark:bg-slate-800" },
          { label: "Activos",   value: active,            color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Inactivos", value: total - active,    color: "text-slate-500 dark:text-slate-400",   bg: "bg-white dark:bg-slate-800" },
          { label: "Con email", value: suppliers.filter(s => s.email).length, color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl border border-slate-100 p-5 shadow-sm dark:border-slate-700`}>
            <p className="text-xs text-slate-500 font-medium mb-1 dark:text-slate-400">{label}</p>
            <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RNC o email…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
      </div>

      {/* Table / Empty */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <Store size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 font-medium dark:text-slate-400">{search ? "Sin resultados" : "No tienes proveedores registrados"}</p>
          {!search && (
            <button onClick={openAdd} className="mt-4 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition">
              Registrar primer proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                {["Proveedor", "Contacto", "Dirección", "Notas", "Estado", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {filtered.length === 0 && (
                <tr><td colSpan={6}>
                  {search
                    ? <EmptyState icon={Store} title="Sin resultados" description={`No hay proveedores que coincidan con "${search}".`} />
                    : <EmptyState icon={Store} title="No hay proveedores aún" description="Agrega tus proveedores para agilizar órdenes de compra y controlar el rendimiento de cada uno." action={{ label: "Añadir proveedor", onClick: openAdd }} />}
                </td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5 dark:text-slate-100">
                      <Store size={13} className="text-brand-500 flex-shrink-0" />
                      {s.name}
                    </p>
                    {s.rnc && <p className="text-xs text-slate-400 mt-0.5 font-mono">RNC: {s.rnc}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs space-y-0.5 dark:text-slate-300">
                    {s.phone && <p className="flex items-center gap-1"><Phone size={10} className="text-slate-400" />{s.phone}</p>}
                    {s.email && <p className="flex items-center gap-1"><Mail size={10} className="text-slate-400" />{s.email}</p>}
                    {!s.phone && !s.email && <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate dark:text-slate-400">
                    {s.address
                      ? <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400 flex-shrink-0" />{s.address}</span>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate dark:text-slate-400">
                    {s.notes
                      ? <span className="flex items-center gap-1"><FileText size={10} className="text-slate-400 flex-shrink-0" />{s.notes}</span>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.active
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full dark:bg-emerald-500/15 dark:text-emerald-300">
                          <CheckCircle2 size={10} /> Activo
                        </span>
                      : <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full dark:bg-slate-700 dark:text-slate-400">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openPerf(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition dark:hover:bg-indigo-500/15" title="Ver historial">
                        <BarChart2 size={14} />
                      </button>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition dark:hover:bg-brand-500/15">
                        <Edit2 size={14} />
                      </button>
                      <AdminButton onClick={() => handleDelete(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition dark:hover:bg-red-500/15">
                        <Trash2 size={14} />
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
