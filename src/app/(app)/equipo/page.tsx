"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UsersRound, Plus, X, Search, RefreshCw } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import type { Department } from "@/types";

interface Employee {
  uid: string;
  email: string;
  fullName: string;
  role: Department;
  createdAt: string | null;
  lastLogin: string | null;
}

const DEPT_META: Record<Department, { label: string; color: string }> = {
  admin:     { label: "Admin",      color: "bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-500/30" },
  ventas:    { label: "Ventas",     color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  compras:   { label: "Compras",    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  logistica: { label: "Logística",  color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30" },
};

const EMPTY_FORM = { fullName: "", email: "", password: "", role: "ventas" as Department };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EquipoPage() {
  const { isAdmin } = useRole();
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });
  const [saving,    setSaving]    = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) { router.replace("/dashboard"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function getToken() {
    return auth.currentUser?.getIdToken() ?? "";
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/employees", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.employees) setEmployees(data.employees);
    } catch {
      toast.error("Error al cargar el equipo");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.password) {
      toast.error("Completa nombre, email y contraseña");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`${form.fullName} agregado a ${DEPT_META[form.role].label}`);
        setShowForm(false);
        setForm({ ...EMPTY_FORM });
        load();
      } else {
        toast.error(data.error ?? "Error al crear usuario");
      }
    } catch {
      toast.error("Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(uid: string, role: Department) {
    setSavingRole(uid);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmployees((prev) => prev.map((e) => (e.uid === uid ? { ...e, role } : e)));
        toast.success("Área actualizada");
      } else {
        toast.error(data.error ?? "Error al actualizar");
      }
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setSavingRole(null);
    }
  }

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q || e.fullName.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
  });

  if (loading) return <div className="space-y-5"><TableSkeleton rows={5} cols={5} /></div>;

  return (
    <div>
      <PageHeader
        title="Mi Equipo"
        subtitle="Empleados de tu empresa y el área a la que tienen acceso"
        action={
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
              <RefreshCw size={13} /> Actualizar
            </button>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition">
              <Plus size={13} /> Agregar usuario
            </button>
          </div>
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={UsersRound} title="Sin empleados todavía"
          description="Agrega usuarios y asígnales un área — Ventas, Compras o Logística — para que trabajen solo con su parte de la app." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                  {["Usuario", "Área", "Último acceso", "Registro"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {filtered.map((emp) => (
                  <tr key={emp.uid} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-sm dark:text-slate-100">{emp.fullName || "—"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{emp.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={emp.role}
                        disabled={savingRole === emp.uid}
                        onChange={(e) => handleRoleChange(emp.uid, e.target.value as Department)}
                        className={`text-xs font-bold px-2 py-1 rounded-lg border ${DEPT_META[emp.role].color} disabled:opacity-50`}
                      >
                        {(Object.keys(DEPT_META) as Department[]).map((d) => (
                          <option key={d} value={d}>{DEPT_META[d].label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(emp.lastLogin)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(emp.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 dark:bg-slate-700/40 dark:border-slate-700">
            {filtered.length} empleado{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">Agregar usuario</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 dark:hover:bg-slate-700 transition">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nombre completo</label>
                <input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="ej. Juan Pérez"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="juan@empresa.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Contraseña temporal</label>
                <input type="text" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Área</label>
                <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Department }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <option value="ventas">Ventas</option>
                  <option value="compras">Compras</option>
                  <option value="logistica">Logística</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {saving ? "Creando…" : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
