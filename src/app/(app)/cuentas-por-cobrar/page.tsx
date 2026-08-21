"use client";

import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import {
  CreditCard, DollarSign, Clock, CheckCircle2, AlertTriangle, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useSales, useInvalidateSales } from "@/hooks/useSales";
import { updateSalePaymentStatus } from "@/lib/firestore/sales";
import { fmtCurrency, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import type { Sale } from "@/types";

type Filter = "all" | "overdue" | "upcoming" | "paid";

export default function CuentasPorCobrarPage() {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const { sales, loading } = useSales(180);
  const invalidate = useInvalidateSales();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmSale, setConfirmSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset page when filter changes is handled automatically by usePagination

  const creditSales = useMemo(
    () => sales.filter((s) => s.paymentStatus === "credito" || s.paymentStatus === "pagado"),
    [sales]
  );

  const now = new Date();
  const in7days = subDays(now, -7);

  const overdue  = creditSales.filter((s) => s.paymentStatus === "credito" && s.dueDate && s.dueDate.toDate() < now);
  const upcoming = creditSales.filter((s) => s.paymentStatus === "credito" && s.dueDate && s.dueDate.toDate() >= now && s.dueDate.toDate() <= in7days);
  const current  = creditSales.filter((s) => s.paymentStatus === "credito" && (!s.dueDate || s.dueDate.toDate() > in7days));
  const paid     = creditSales.filter((s) => s.paymentStatus === "pagado");

  const totalPending = [...overdue, ...upcoming, ...current].reduce((s, v) => s + v.totalRevenue, 0);
  const totalOverdue = overdue.reduce((s, v) => s + v.totalRevenue, 0);

  const filtered = useMemo(() => {
    if (filter === "overdue")  return overdue;
    if (filter === "upcoming") return upcoming;
    if (filter === "paid")     return paid;
    return [...overdue, ...upcoming, ...current];
  }, [filter, overdue, upcoming, current, paid]);

  const pagination = usePagination(filtered, 20);

  async function markPaid() {
    if (!user || !confirmSale) return;
    setSaving(true);
    const r = await updateSalePaymentStatus(workspaceId, confirmSale.id, "pagado");
    setSaving(false);
    setConfirmSale(null);
    if (r.ok) { toast.success("Marcado como pagado"); invalidate(); }
    else toast.error(r.message);
  }

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader title="Cuentas por cobrar" subtitle="Ventas a crédito y su estado de pago" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Por cobrar",       value: fmtCurrency(totalPending),   icon: CreditCard,   color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300" },
          { label: "Vencidas",         value: fmtCurrency(totalOverdue),   icon: AlertTriangle, color: "text-red-600 bg-red-50 dark:bg-red-500/15 dark:text-red-300" },
          { label: "Vencen en 7 días", value: upcoming.length,             icon: Clock,        color: "text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" },
          { label: "Cobradas",         value: fmtCurrency(paid.reduce((s, v) => s + v.totalRevenue, 0)), icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: "all",      label: `Todas (${overdue.length + upcoming.length + current.length})` },
          { key: "overdue",  label: `Vencidas (${overdue.length})` },
          { key: "upcoming", label: `Próximas a vencer (${upcoming.length})` },
          { key: "paid",     label: `Cobradas (${paid.length})` },
        ] as { key: Filter; label: string }[]).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${filter === f.key ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-10 text-center">
          <DollarSign size={40} className="text-slate-200 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">No hay registros en esta categoría.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                  {["Fecha venta", "Cliente", "Producto", "Importe", "Vence", "Estado", ""].map((h) => (
                    <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagination.paged.map((s) => {
                  const dueDate   = s.dueDate?.toDate();
                  const isOverdue = dueDate && dueDate < now && s.paymentStatus === "credito";
                  const isDue7    = dueDate && dueDate >= now && dueDate <= in7days && s.paymentStatus === "credito";
                  return (
                    <tr key={s.id} className={`border-t border-slate-50 dark:border-slate-700/50 ${isOverdue ? "bg-red-50/40 dark:bg-red-500/10" : isDue7 ? "bg-amber-50/40 dark:bg-amber-500/10" : ""}`}>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(s.saleDate)}</td>
                      <td className="py-3 px-4 font-medium truncate max-w-[130px]">{s.client || "—"}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 truncate max-w-[130px]">{s.productName}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(s.totalRevenue)}</td>
                      <td className={`py-3 px-4 whitespace-nowrap text-xs font-semibold ${isOverdue ? "text-red-600 dark:text-red-400" : isDue7 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
                        {dueDate ? fmtDate(s.dueDate!) : "—"}{isOverdue ? " ⚠️" : ""}
                      </td>
                      <td className="py-3 px-4">
                        {s.paymentStatus === "pagado" ? (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300 px-2 py-0.5 rounded-full">Cobrado</span>
                        ) : (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOverdue ? "text-red-700 bg-red-100 dark:bg-red-500/15 dark:text-red-300" : "text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300"}`}>
                            {isOverdue ? "Vencida" : "Pendiente"}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.paymentStatus === "credito" && (
                          <button
                            onClick={() => setConfirmSale(s)}
                            className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition whitespace-nowrap"
                          >
                            Marcar pagado
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={20}
        onPage={pagination.setPage}
      />

      <ConfirmModal
        isOpen={!!confirmSale}
        title="Marcar como pagado"
        description={`¿Confirmas que se recibió el pago de ${confirmSale ? fmtCurrency(confirmSale.totalRevenue) : ""} de ${confirmSale?.client || "este cliente"}?`}
        confirmLabel="Sí, cobrado"
        loading={saving}
        onConfirm={markPaid}
        onCancel={() => setConfirmSale(null)}
      />
    </div>
  );
}
