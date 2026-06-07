"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import {
  Store, Plus, Edit2, Trash2, X, CheckCircle2, Search,
  Phone, Mail, MapPin, FileText, Download,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listSuppliers, addSupplier, updateSupplier, deleteSupplier, type Supplier,
} from "@/lib/firestore/suppliers";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useEffect } from "react";

const EMPTY: Omit<Supplier, "id" | "createdAt"> = {
  name: "", rnc: "", phone: "", email: "", address: "", notes: "", active: true,
};

export default function ProveedoresPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState<Supplier | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setSuppliers(await listSuppliers(user.uid)); }
    catch { toast.error("Error al cargar proveedores"); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, rnc: s.rnc, phone: s.phone, email: s.email, address: s.address, notes: s.notes, active: s.active });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateSupplier(user.uid, editing.id, form);
        toast.success("Proveedor actualizado");
      } else {
        await addSupplier(user.uid, form);
        toast.success("Proveedor creado");
      }
      await load();
      setShowForm(false);
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }

  async function handleDelete(s: Supplier) {
    if (!user || !confirm(`¿Eliminar "${s.name}"?`)) return;
    await deleteSupplier(user.uid, s.id);
    toast.success("Proveedor eliminado");
    await load();
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

  const total   = suppliers.length;
  const active  = suppliers.filter((s) => s.active).length;

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800">{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Nombre *",         key: "name"    as const, placeholder: "ej. Distribuidora ABC" },
                  { label: "RNC / ID fiscal",  key: "rnc"     as const, placeholder: "ej. 1-31-12345-6"     },
                  { label: "Teléfono",         key: "phone"   as const, placeholder: "809-555-0000"          },
                  { label: "Email",            key: "email"   as const, placeholder: "compras@abc.com"       },
                ]).map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Calle, ciudad, país"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Condiciones de pago, contacto, observaciones…" rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="w-4 h-4 rounded accent-brand-600" />
                <span className="text-sm font-medium text-slate-700">Proveedor activo</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
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

      <PageHeader
        title="Proveedores"
        subtitle={`${total} proveedor${total !== 1 ? "es" : ""} · ${active} activo${active !== 1 ? "s" : ""}`}
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition">
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
          { label: "Total", value: total, color: "text-slate-800", bg: "bg-white" },
          { label: "Activos", value: active, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Inactivos", value: total - active, color: "text-slate-500", bg: "bg-white" },
          { label: "Con email", value: suppliers.filter(s => s.email).length, color: "text-indigo-700", bg: "bg-indigo-50" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl border border-slate-100 p-5 shadow-sm`}>
            <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
            <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RNC o email…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
      </div>

      {/* Table / Empty */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <Store size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">{search ? "Sin resultados" : "No tienes proveedores registrados"}</p>
          {!search && (
            <button onClick={openAdd} className="mt-4 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition">
              Registrar primer proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                {["Proveedor", "Contacto", "Dirección", "Notas", "Estado", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Store size={13} className="text-brand-500 flex-shrink-0" />
                      {s.name}
                    </p>
                    {s.rnc && <p className="text-xs text-slate-400 mt-0.5 font-mono">RNC: {s.rnc}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs space-y-0.5">
                    {s.phone && <p className="flex items-center gap-1"><Phone size={10} className="text-slate-400" />{s.phone}</p>}
                    {s.email && <p className="flex items-center gap-1"><Mail size={10} className="text-slate-400" />{s.email}</p>}
                    {!s.phone && !s.email && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">
                    {s.address
                      ? <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400 flex-shrink-0" />{s.address}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">
                    {s.notes
                      ? <span className="flex items-center gap-1"><FileText size={10} className="text-slate-400 flex-shrink-0" />{s.notes}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.active
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                          <CheckCircle2 size={10} /> Activo
                        </span>
                      : <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                        <Trash2 size={14} />
                      </button>
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
