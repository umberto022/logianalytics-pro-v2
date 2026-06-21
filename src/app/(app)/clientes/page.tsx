"use client";

import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Users, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin,
  FileText, X, TrendingUp, ShoppingCart, DollarSign, ChevronRight, Download, Printer,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomers, useInvalidateCustomers } from "@/hooks/useCustomers";
import { useSales } from "@/hooks/useSales";
import { addCustomer, updateCustomer, deleteCustomer } from "@/lib/firestore/customers";
import { computeByClient } from "@/lib/firestore/sales";
import { fmtCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Period } from "@/types";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useUndoDelete } from "@/hooks/useUndoDelete";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { customerSchema, zodErrors } from "@/lib/schemas";
import type { Customer } from "@/types";

const EMPTY: Omit<Customer, "id" | "createdAt" | "updatedAt"> = {
  name: "", rnc: "", phone: "", email: "", address: "", notes: "",
};

export default function ClientesPage() {
  const { user } = useAuth();
  const { customers, loading } = useCustomers();
  const [salesPeriod, setSalesPeriod] = useState<Period>(90);
  const { sales } = useSales(salesPeriod);
  const invalidate  = useInvalidateCustomers();
  const undoDelete  = useUndoDelete();

  const [search, setSearch]       = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Customer | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [initialForm, setInitialForm] = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [detail, setDetail]       = useState<Customer | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  function exportCSV() {
    const headers = ["Nombre", "RNC/Cédula", "Teléfono", "Email", "Dirección", "Notas"];
    const rows = filtered.map((c) => [
      c.name, c.rnc, c.phone, c.email, c.address, c.notes,
    ].map((v) => `"${(v ?? "").replace(/"/g, '""')}"`));
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "clientes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function tryCloseModal() {
    if (isDirty) { setShowDirtyConfirm(true); return; }
    setShowModal(false);
  }

  // Stats por cliente desde ventas de los últimos 90 días
  const clientStats = useMemo(() => {
    const byName = new Map(computeByClient(sales).map((c) => [c.client.toLowerCase(), c]));
    return byName;
  }, [sales]);

  const filtered = useMemo(() =>
    customers.filter((c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.rnc.includes(search)
    ), [customers, search]);

  const pagination = usePagination(filtered, 25);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setInitialForm({ ...EMPTY });
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    const f = { name: c.name, rnc: c.rnc, phone: c.phone, email: c.email, address: c.address, notes: c.notes };
    setForm(f);
    setInitialForm(f);
    setShowModal(true);
  }

  async function handleSave() {
    if (!user) return;
    const parsed = customerSchema.safeParse(form);
    if (!parsed.success) {
      setFormErrors(zodErrors(parsed));
      toast.error("Corrige los errores del formulario");
      return;
    }
    setFormErrors({});
    setSaving(true);
    const result = editing
      ? await updateCustomer(user.uid, editing.id, form)
      : await addCustomer(user.uid, form);
    if (result.ok) {
      toast.success(result.message);
      invalidate();
      setShowModal(false);
    } else {
      toast.error(result.message);
    }
    setSaving(false);
  }

  function handleDelete(c: Customer) {
    if (!user) return;
    undoDelete(`"${c.name}" eliminado`, async () => {
      const result = await deleteCustomer(user.uid, c.id);
      if (result.ok) invalidate();
      else toast.error(result.message);
    });
  }

  const inp = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const lbl = "block text-sm font-medium text-slate-700 mb-1";

  if (loading) return <div className="space-y-5"><TableSkeleton rows={6} cols={6} /></div>;

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} registrado${customers.length !== 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <PeriodSelect value={salesPeriod} onChange={setSalesPeriod} />
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition print:hidden">
              <Printer size={13} /> PDF
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total clientes",   value: customers.length,                                          icon: Users,       color: "text-brand-600 bg-brand-50" },
          { label: `Con compras (${salesPeriod}d)`, value: clientStats.size,                                         icon: ShoppingCart, color: "text-emerald-600 bg-emerald-50" },
          { label: `Ingresos (${salesPeriod}d)`,    value: fmtCurrency(sales.reduce((s, v) => s + v.totalRevenue, 0)), icon: DollarSign,  color: "text-amber-600 bg-amber-50" },
          { label: `Ganancia (${salesPeriod}d)`,    value: fmtCurrency(sales.reduce((s, v) => s + v.profit, 0)),       icon: TrendingUp,  color: "text-purple-600 bg-purple-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RNC, teléfono o email…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition">
          <Download size={16} /> Exportar CSV
        </button>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          search
            ? <EmptyState icon={Users} title="Sin resultados" description={`No encontramos clientes que coincidan con "${search}".`} />
            : <EmptyState icon={Users} title="No hay clientes aún" description="Registra tus clientes para hacer seguimiento de compras, créditos y estadísticas por cliente." action={{ label: "Añadir primer cliente", onClick: openAdd }} />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Cliente", "RNC", "Teléfono", "Email", "Ventas (90d)", "Ingresos (90d)", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pagination.paged.map((c) => {
                  const stats = clientStats.get(c.name.toLowerCase());
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        {c.address && <p className="text-xs text-slate-400 truncate max-w-[180px]">{c.address}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.rnc || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[160px]">{c.email || "—"}</td>
                      <td className="px-4 py-3">
                        {stats ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                            <ShoppingCart size={10} /> {stats.numSales}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {stats ? fmtCurrency(stats.revenue) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setDetail(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition">
                            <ChevronRight size={15} />
                          </button>
                          <button onClick={() => openEdit(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={25}
            onPage={pagination.setPage}
          />
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={tryCloseModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-800">
                {editing ? "Editar cliente" : "Nuevo cliente"}
              </h2>
              <button onClick={tryCloseModal} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={lbl}>Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className={`${inp} ${formErrors.name ? "border-red-400" : ""}`} placeholder="Nombre del cliente o empresa" />
                {formErrors.name && <p className="text-xs text-red-500 mt-0.5">{formErrors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>RNC / Cédula</label>
                  <input value={form.rnc} onChange={(e) => setForm((p) => ({ ...p, rnc: e.target.value }))} className={inp} placeholder="000-00000-0" />
                </div>
                <div>
                  <label className={lbl}>Teléfono</label>
                  <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className={inp} placeholder="809-000-0000" />
                </div>
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={`${inp} ${formErrors.email ? "border-red-400" : ""}`} placeholder="cliente@empresa.com" />
                {formErrors.email && <p className="text-xs text-red-500 mt-0.5">{formErrors.email}</p>}
              </div>
              <div>
                <label className={lbl}>Dirección</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className={inp} placeholder="Calle, ciudad, país" />
              </div>
              <div>
                <label className={lbl}>Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className={`${inp} resize-none`} rows={2} placeholder="Notas internas opcionales…" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={tryCloseModal} className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {saving ? "Guardando…" : (editing ? "Actualizar" : "Agregar cliente")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-800 truncate">{detail.name}</h2>
              <button onClick={() => setDetail(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>

            <div className="space-y-3 text-sm">
              {detail.rnc && (
                <div className="flex items-center gap-2 text-slate-600">
                  <FileText size={14} className="text-slate-400 flex-shrink-0" />
                  <span>RNC: <span className="font-medium">{detail.rnc}</span></span>
                </div>
              )}
              {detail.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone size={14} className="text-slate-400 flex-shrink-0" />
                  <span>{detail.phone}</span>
                </div>
              )}
              {detail.email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail size={14} className="text-slate-400 flex-shrink-0" />
                  <span>{detail.email}</span>
                </div>
              )}
              {detail.address && (
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                  <span>{detail.address}</span>
                </div>
              )}
              {detail.notes && (
                <div className="bg-slate-50 rounded-xl p-3 text-slate-600 text-sm">{detail.notes}</div>
              )}
            </div>

            {/* Stats de ventas */}
            {(() => {
              const stats = clientStats.get(detail.name.toLowerCase());
              if (!stats) return (
                <p className="text-xs text-slate-400 mt-4 text-center">Sin ventas registradas en los últimos 90 días</p>
              );
              return (
                <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100">
                  {[
                    { label: "Ventas",    value: stats.numSales },
                    { label: "Ingresos",  value: fmtCurrency(stats.revenue) },
                    { label: "Ganancia",  value: fmtCurrency(stats.profit) },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="font-bold text-slate-800 text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setDetail(null); openEdit(detail); }}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-2">
                <Edit2 size={14} /> Editar
              </button>
              <button onClick={() => { handleDelete(detail); setDetail(null); }}
                className="flex-1 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2">
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDirtyConfirm}
        title="Cambios sin guardar"
        description="Tienes cambios sin guardar. ¿Cerrar de todas formas?"
        confirmLabel="Cerrar sin guardar"
        onConfirm={() => { setShowDirtyConfirm(false); setShowModal(false); }}
        onCancel={() => setShowDirtyConfirm(false)}
      />

    </div>
  );
}
