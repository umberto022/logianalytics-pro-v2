"use client";

import { useEffect, useState, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import toast from "react-hot-toast";
import {
  MessageSquare, Users, Bug, Lightbulb, HelpCircle,
  Trash2, Search, RefreshCw, ShieldAlert, CheckCircle2, Clock,
} from "lucide-react";

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
  bug:        { label: "Bug",        icon: Bug,         color: "bg-red-50 text-red-600 border-red-100"      },
  sugerencia: { label: "Sugerencia", icon: Lightbulb,   color: "bg-amber-50 text-amber-600 border-amber-100"},
  pregunta:   { label: "Pregunta",   icon: HelpCircle,  color: "bg-blue-50 text-blue-600 border-blue-100"   },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPage() {
  const { isAdmin } = useRole();
  const router      = useRouter();

  const [tab,           setTab]           = useState<"feedback" | "users">("feedback");
  const [feedback,      setFeedback]      = useState<FeedbackItem[]>([]);
  const [users,         setUsers]         = useState<UserItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState<"all" | "bug" | "sugerencia" | "pregunta">("all");
  const [deleting,      setDeleting]      = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) { router.replace("/dashboard"); return; }
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function getToken() {
    return auth.currentUser?.getIdToken() ?? "";
  }

  async function loadAll() {
    setLoading(true);
    try {
      const token = await getToken();
      const [fbRes, usRes] = await Promise.all([
        fetch("/api/admin/feedback", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/users",    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const fbData = await fbRes.json();
      const usData = await usRes.json();
      if (fbData.items) setFeedback(fbData.items);
      if (usData.users) setUsers(usData.users);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
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
  const kpis = [
    { label: "Total feedback",  value: feedback.length,                                           icon: MessageSquare, color: "text-indigo-600 bg-indigo-50"  },
    { label: "Bugs reportados", value: feedback.filter((f) => f.type === "bug").length,           icon: Bug,           color: "text-red-600 bg-red-50"        },
    { label: "Sugerencias",     value: feedback.filter((f) => f.type === "sugerencia").length,    icon: Lightbulb,     color: "text-amber-600 bg-amber-50"    },
    { label: "Usuarios beta",   value: users.length,                                              icon: Users,         color: "text-emerald-600 bg-emerald-50" },
  ];

  if (loading) return <div className="space-y-5"><TableSkeleton rows={6} cols={5} /></div>;

  return (
    <div>
      <PageHeader
        title="Panel de Administración"
        subtitle="Feedback de beta testers y gestión de usuarios"
        action={
          <button onClick={loadAll} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw size={13} /> Actualizar
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit">
        {(["feedback", "users"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setSearch(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${tab === t ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
            {t === "feedback" ? `Feedback (${feedback.length})` : `Usuarios (${users.length})`}
          </button>
        ))}
      </div>

      {/* Search + type filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "feedback" ? "Buscar mensaje, email, página…" : "Buscar usuario…"}
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
        </div>
        {tab === "feedback" && (
          <div className="flex gap-1.5">
            {(["all", "bug", "sugerencia", "pregunta"] as const).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                  typeFilter === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}>
                {t === "all" ? "Todos" : TYPE_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Feedback table ── */}
      {tab === "feedback" && (
        filteredFeedback.length === 0
          ? <EmptyState icon={MessageSquare} title="Sin feedback aún" description="Los beta testers aún no han enviado feedback. Comparte la app para empezar a recibir reportes." />
          : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                      {["Tipo", "Mensaje", "Usuario", "Página", "Fecha", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredFeedback.map((f) => {
                      const meta = TYPE_META[f.type] ?? TYPE_META.pregunta;
                      const Icon = meta.icon;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.color}`}>
                              <Icon size={11} /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-slate-800 text-sm leading-snug line-clamp-2">{f.message}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-slate-800 text-xs font-medium">{f.userName || "—"}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{f.userEmail}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
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
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
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
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                      {["Usuario", "Empresa", "Rol", "Onboarding", "Último acceso", "Registro"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-sm">{u.fullName || "—"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{u.companyName || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-brand-50 text-brand-600 border border-brand-200" : "bg-slate-100 text-slate-500"}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.onboarding
                            ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={13} /> Completado</span>
                            : <span className="flex items-center gap-1 text-xs text-amber-500"><Clock size={13} /> Pendiente</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(u.lastLogin)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
                {filteredUsers.length} usuario{filteredUsers.length !== 1 ? "s" : ""} beta registrado{filteredUsers.length !== 1 ? "s" : ""}
              </div>
            </div>
          )
      )}
    </div>
  );
}
