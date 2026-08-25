"use client";

import { useEffect, useState, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import toast from "react-hot-toast";
import {
  MessageSquare, Users, Bug, Lightbulb, HelpCircle,
  Trash2, Search, RefreshCw, ShieldAlert, CheckCircle2, Clock, Download,
  Building2, X, DollarSign,
} from "lucide-react";
import type { WorkspaceStatus, WorkspacePaymentStatus } from "@/types";

interface WorkspaceItem {
  workspaceId:     string;
  companyName:     string;
  adminName:       string;
  adminEmail:      string;
  workspaceStatus: WorkspaceStatus;
  paymentStatus:   WorkspacePaymentStatus;
  nextPaymentDate: string | null;
  billingNotes:    string;
  createdAt:       string | null;
  approvedAt:      string | null;
}

const WS_STATUS_META: Record<WorkspaceStatus, { label: string; color: string }> = {
  pending:   { label: "Pendiente de aprobación", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  active:    { label: "Activo",                  color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  suspended: { label: "Suspendido",              color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30" },
  cancelled: { label: "Cancelado",                color: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/60 dark:text-slate-400 dark:border-slate-600" },
};

const PAY_STATUS_META: Record<WorkspacePaymentStatus, { label: string; color: string }> = {
  current: { label: "Al día",             color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  due:     { label: "Pago pendiente",     color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
};

interface FeedbackItem {
  id:        string;
  uid:       string;
  type:      "bug" | "sugerencia" | "pregunta";
  message:   string;
  userEmail: string;
  userName:  string;
  page:      string;
  createdAt: string | null;
}

interface UserItem {
  uid:         string;
  email:       string;
  fullName:    string;
  companyName: string | undefined;
  role:        string;
  createdAt:   string | null;
  lastLogin:   string | null;
  onboarding:  boolean | undefined;
}

const TYPE_META = {
  bug:        { label: "Bug",        icon: Bug,         color: "bg-red-50 text-red-600 border-red-100 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30"          },
  sugerencia: { label: "Sugerencia", icon: Lightbulb,   color: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"},
  pregunta:   { label: "Pregunta",   icon: HelpCircle,  color: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30"     },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPage() {
  const { isPlatformAdmin } = useRole();
  const router      = useRouter();

  const [tab,           setTab]           = useState<"feedback" | "users" | "empresas">("feedback");
  const [feedback,      setFeedback]      = useState<FeedbackItem[]>([]);
  const [users,         setUsers]         = useState<UserItem[]>([]);
  const [workspaces,    setWorkspaces]    = useState<WorkspaceItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState<"all" | "bug" | "sugerencia" | "pregunta">("all");
  const [deleting,      setDeleting]      = useState<string | null>(null);
  const [managing,      setManaging]      = useState<WorkspaceItem | null>(null);
  const [confirmAction,  setConfirmAction] = useState<{ workspace: WorkspaceItem; action: "suspend" | "cancel" } | null>(null);
  const [savingAction,   setSavingAction]  = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin) { router.replace("/dashboard"); return; }
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  async function getToken() {
    return auth.currentUser?.getIdToken() ?? "";
  }

  async function loadAll() {
    setLoading(true);
    try {
      const token = await getToken();
      const [fbRes, usRes, wsRes] = await Promise.all([
        fetch("/api/admin/feedback",   { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/users",      { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/workspaces", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const fbData = await fbRes.json();
      const usData = await usRes.json();
      const wsData = await wsRes.json();
      if (fbData.items) setFeedback(fbData.items);
      if (usData.users) setUsers(usData.users);
      if (wsData.workspaces) setWorkspaces(wsData.workspaces);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  /** Envuelve en comillas y escapa comillas internas si el campo trae coma, comilla o salto de línea. */
  function escapeCsvField(value: unknown): string {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportFeedbackCSV() {
    const header = ["Tipo", "Mensaje", "Usuario", "Email", "Página", "Fecha"];
    const rows = filteredFeedback.map((f) => [
      TYPE_META[f.type]?.label ?? f.type,
      f.message,
      f.userName,
      f.userEmail,
      f.page,
      fmtDate(f.createdAt),
    ].map(escapeCsvField).join(","));
    // BOM UTF-8 al inicio para que Excel detecte los acentos correctamente.
    const csv = "﻿" + header.join(",") + "\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `feedback-logianalytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function deleteFeedback(uid: string, id: string) {
    setDeleting(id);
    try {
      const token = await getToken();
      const res   = await fetch("/api/admin/feedback", {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ uid, id }),
      });
      if ((await res.json()).ok) {
        setFeedback((prev) => prev.filter((f) => f.id !== id));
        toast.success("Feedback eliminado");
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleting(null);
    }
  }

  async function runWorkspaceAction(
    workspaceId: string,
    action: "approve" | "suspend" | "reactivate" | "cancel" | "markPaid" | "markDue",
    extra?: { nextPaymentDate?: string; billingNotes?: string }
  ) {
    setSavingAction(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/workspaces", {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ workspaceId, action, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Actualizado");
        await loadAll();
        setManaging(null);
        setConfirmAction(null);
      } else {
        toast.error(data.error ?? "Error al actualizar");
      }
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setSavingAction(false);
    }
  }

  const filteredWorkspaces = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) =>
      w.adminEmail.toLowerCase().includes(q) ||
      w.adminName.toLowerCase().includes(q) ||
      w.companyName.toLowerCase().includes(q)
    );
  }, [workspaces, search]);

  const filteredFeedback = useMemo(() => {
    const q = search.toLowerCase();
    return feedback.filter((f) => {
      const matchType = typeFilter === "all" || f.type === typeFilter;
      const matchQ    = !q || f.message.toLowerCase().includes(q) || f.userEmail.toLowerCase().includes(q) || f.page.toLowerCase().includes(q);
      return matchType && matchQ;
    });
  }, [feedback, typeFilter, search]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      (u.companyName ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const pendingWorkspaces = workspaces.filter((w) => w.workspaceStatus === "pending").length;
  const kpis = [
    { label: "Empresas por aprobar", value: pendingWorkspaces,                                     icon: Building2,     color: pendingWorkspaces > 0 ? "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15" : "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-700/60" },
    { label: "Total feedback",  value: feedback.length,                                           icon: MessageSquare, color: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15"  },
    { label: "Bugs reportados", value: feedback.filter((f) => f.type === "bug").length,           icon: Bug,           color: "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/15"        },
    { label: "Sugerencias",     value: feedback.filter((f) => f.type === "sugerencia").length,    icon: Lightbulb,     color: "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15"    },
    { label: "Usuarios totales", value: users.length,                                             icon: Users,         color: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15" },
  ];

  if (loading) return <div className="space-y-5"><TableSkeleton rows={6} cols={5} /></div>;

  return (
    <div>
      <PageHeader
        title="Panel de Administración"
        subtitle="Feedback de beta testers y gestión de usuarios"
        action={
          <div className="flex items-center gap-2">
            {tab === "feedback" && filteredFeedback.length > 0 && (
              <button onClick={exportFeedbackCSV} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
                <Download size={13} /> Exportar CSV
              </button>
            )}
            <button onClick={loadAll} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
              <RefreshCw size={13} /> Actualizar
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3 dark:bg-slate-800 dark:border-slate-700">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit dark:bg-slate-800">
        {(["empresas", "feedback", "users"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setSearch(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${tab === t ? "bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
            {t === "feedback" ? `Feedback (${feedback.length})` : t === "users" ? `Usuarios (${users.length})` : `Empresas (${workspaces.length})`}
          </button>
        ))}
      </div>

      {/* Search + type filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "feedback" ? "Buscar mensaje, email, página…" : tab === "empresas" ? "Buscar empresa, admin, email…" : "Buscar usuario…"}
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
        </div>
        {tab === "feedback" && (
          <div className="flex gap-1.5">
            {(["all", "bug", "sugerencia", "pregunta"] as const).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                  typeFilter === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}>
                {t === "all" ? "Todos" : TYPE_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Empresas table ── */}
      {tab === "empresas" && (
        filteredWorkspaces.length === 0
          ? <EmptyState icon={Building2} title="Sin empresas" description="Todavía no hay ninguna empresa registrada." />
          : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                      {["Empresa", "Estado", "Pago", "Próximo pago", "Registrada", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {filteredWorkspaces.map((w) => (
                      <tr key={w.workspaceId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-sm dark:text-slate-100">{w.companyName || w.adminName || "—"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{w.adminName} · {w.adminEmail}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${WS_STATUS_META[w.workspaceStatus].color}`}>
                            {WS_STATUS_META[w.workspaceStatus].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAY_STATUS_META[w.paymentStatus].color}`}>
                            {PAY_STATUS_META[w.paymentStatus].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{w.nextPaymentDate || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(w.createdAt)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setManaging(w)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                          >
                            Gestionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 dark:bg-slate-700/40 dark:border-slate-700">
                {filteredWorkspaces.length} empresa{filteredWorkspaces.length !== 1 ? "s" : ""}
                {pendingWorkspaces > 0 && ` · ${pendingWorkspaces} por aprobar`}
              </div>
            </div>
          )
      )}

      {/* ── Feedback table ── */}
      {tab === "feedback" && (
        filteredFeedback.length === 0
          ? <EmptyState icon={MessageSquare} title="Sin feedback aún" description="Los beta testers aún no han enviado feedback. Comparte la app para empezar a recibir reportes." />
          : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                      {["Tipo", "Mensaje", "Usuario", "Página", "Fecha", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {filteredFeedback.map((f) => {
                      const meta = TYPE_META[f.type] ?? TYPE_META.pregunta;
                      const Icon = meta.icon;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.color}`}>
                              <Icon size={11} /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-slate-800 text-sm leading-snug line-clamp-2 dark:text-slate-100">{f.message}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-slate-800 text-xs font-medium dark:text-slate-100">{f.userName || "—"}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{f.userEmail}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md dark:text-slate-400 dark:bg-slate-700/60">
                              {f.page || "/"}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400">
                            {fmtDate(f.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteFeedback(f.uid, f.id)}
                              disabled={deleting === f.id}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/15 transition disabled:opacity-50"
                            >
                              {deleting === f.id
                                ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-red-400 rounded-full animate-spin block" />
                                : <Trash2 size={14} />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 dark:bg-slate-700/40 dark:border-slate-700">
                {filteredFeedback.length} reporte{filteredFeedback.length !== 1 ? "s" : ""}
                {typeFilter !== "all" && ` · filtrado por ${TYPE_META[typeFilter].label}`}
              </div>
            </div>
          )
      )}

      {/* ── Users table ── */}
      {tab === "users" && (
        filteredUsers.length === 0
          ? <EmptyState icon={Users} title="Sin usuarios" description="Aún no hay usuarios registrados en la plataforma." />
          : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                      {["Usuario", "Empresa", "Rol", "Onboarding", "Último acceso", "Registro"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {filteredUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-sm dark:text-slate-100">{u.fullName || "—"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{u.companyName || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-brand-50 text-brand-600 border border-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-500/30" : "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.onboarding
                            ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> Completado</span>
                            : <span className="flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400"><Clock size={13} /> Pendiente</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(u.lastLogin)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 dark:bg-slate-700/40 dark:border-slate-700">
                {filteredUsers.length} usuario{filteredUsers.length !== 1 ? "s" : ""} beta registrado{filteredUsers.length !== 1 ? "s" : ""}
              </div>
            </div>
          )
      )}

      {managing && (
        <ManageWorkspaceModal
          workspace={managing}
          saving={savingAction}
          onClose={() => setManaging(null)}
          onApprove={() => runWorkspaceAction(managing.workspaceId, "approve")}
          onReactivate={() => runWorkspaceAction(managing.workspaceId, "reactivate")}
          onTogglePayment={() => runWorkspaceAction(managing.workspaceId, managing.paymentStatus === "current" ? "markDue" : "markPaid")}
          onSaveBilling={(nextPaymentDate, billingNotes) => runWorkspaceAction(managing.workspaceId, managing.paymentStatus === "current" ? "markPaid" : "markDue", { nextPaymentDate, billingNotes })}
          onRequestSuspend={() => setConfirmAction({ workspace: managing, action: "suspend" })}
          onRequestCancel={() => setConfirmAction({ workspace: managing, action: "cancel" })}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.action === "cancel" ? "Cancelar empresa" : "Suspender acceso"}
        description={
          confirmAction?.action === "cancel"
            ? `¿Cancelar el acceso de "${confirmAction.workspace.companyName || confirmAction.workspace.adminName}"? Nadie de esa empresa va a poder entrar hasta que la reactives.`
            : `¿Suspender el acceso de "${confirmAction?.workspace.companyName || confirmAction?.workspace.adminName}"? Nadie de esa empresa va a poder entrar hasta que la reactives.`
        }
        confirmLabel={confirmAction?.action === "cancel" ? "Cancelar empresa" : "Suspender"}
        danger
        loading={savingAction}
        onConfirm={() => confirmAction && runWorkspaceAction(confirmAction.workspace.workspaceId, confirmAction.action)}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function ManageWorkspaceModal({
  workspace, saving, onClose, onApprove, onReactivate, onTogglePayment, onSaveBilling, onRequestSuspend, onRequestCancel,
}: {
  workspace: WorkspaceItem;
  saving: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReactivate: () => void;
  onTogglePayment: () => void;
  onSaveBilling: (nextPaymentDate: string, billingNotes: string) => void;
  onRequestSuspend: () => void;
  onRequestCancel: () => void;
}) {
  const [nextPaymentDate, setNextPaymentDate] = useState(workspace.nextPaymentDate ?? "");
  const [billingNotes,    setBillingNotes]    = useState(workspace.billingNotes ?? "");
  const dirty = nextPaymentDate !== (workspace.nextPaymentDate ?? "") || billingNotes !== (workspace.billingNotes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{workspace.companyName || workspace.adminName}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-5">{workspace.adminName} · {workspace.adminEmail}</p>

        <div className="flex items-center gap-2 mb-5">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${WS_STATUS_META[workspace.workspaceStatus].color}`}>
            {WS_STATUS_META[workspace.workspaceStatus].label}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAY_STATUS_META[workspace.paymentStatus].color}`}>
            {PAY_STATUS_META[workspace.paymentStatus].label}
          </span>
        </div>

        {workspace.workspaceStatus === "pending" && (
          <button onClick={onApprove} disabled={saving}
            className="w-full mb-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
            {saving ? "Aprobando…" : "Aprobar empresa"}
          </button>
        )}

        {(workspace.workspaceStatus === "suspended" || workspace.workspaceStatus === "cancelled") && (
          <button onClick={onReactivate} disabled={saving}
            className="w-full mb-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
            {saving ? "Reactivando…" : "Reactivar acceso"}
          </button>
        )}

        {workspace.workspaceStatus === "active" && (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Próximo pago (referencia, no bloquea nada)</label>
                <input type="date" value={nextPaymentDate} onChange={(e) => setNextPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notas de facturación</label>
                <textarea value={billingNotes} onChange={(e) => setBillingNotes(e.target.value)} rows={2}
                  placeholder="ej. $50/mes por transferencia BHD"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500" />
              </div>
              {dirty && (
                <button onClick={() => onSaveBilling(nextPaymentDate, billingNotes)} disabled={saving}
                  className="w-full py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50">
                  Guardar notas
                </button>
              )}
            </div>

            <button onClick={onTogglePayment} disabled={saving}
              className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50">
              <DollarSign size={15} />
              {workspace.paymentStatus === "current" ? "Marcar como pago pendiente" : "Marcar como pagado"}
            </button>

            <button onClick={onRequestSuspend} disabled={saving}
              className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-sm font-semibold rounded-lg transition disabled:opacity-50">
              Suspender acceso
            </button>
          </>
        )}

        {workspace.workspaceStatus !== "cancelled" && (
          <button onClick={onRequestCancel} disabled={saving}
            className="w-full mt-3 py-2.5 text-red-500 hover:text-red-600 dark:text-red-400 text-sm font-semibold transition disabled:opacity-50">
            Cancelar empresa
          </button>
        )}
      </div>
    </div>
  );
}
