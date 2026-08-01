"use client";

import { useState } from "react";
import { Clock, PackageCheck, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { ReceiveOrderModal } from "@/components/ui/ReceiveOrderModal";
import { usePurchaseOrders, useInvalidatePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { fmtCurrency } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

const STATUS_META: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  parcial:   { label: "Parcial",   color: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function RecepcionesPage() {
  const { orders, loading } = usePurchaseOrders();
  const invalidate = useInvalidatePurchaseOrders();
  const [search, setSearch] = useState("");
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  const pending = orders.filter((o) => o.status === "pendiente" || o.status === "parcial");
  const filtered = pending.filter((o) => {
    const q = search.toLowerCase();
    return !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.supplierName.toLowerCase().includes(q);
  });

  if (loading) return <div className="space-y-5"><TableSkeleton rows={5} cols={5} /></div>;

  return (
    <div>
      <PageHeader
        title="Recepciones"
        subtitle="Órdenes de compra pendientes de recibir en almacén"
      />

      <div className="relative mb-5 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar orden o proveedor…"
          className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Sin recepciones pendientes"
          description="Todas las órdenes de compra están al día. Aquí aparecerán las órdenes que Compras registre y que esperan ser recibidas en almacén." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                  {["N° Orden", "Proveedor", "Productos", "Total", "Fecha esperada", "Estado", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((order) => {
                  const meta = STATUS_META[order.status] ?? STATUS_META.pendiente;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-600 whitespace-nowrap">{order.orderNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{order.supplierName}</td>
                      <td className="px-4 py-3 text-slate-600">{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{fmtCurrency(order.total)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.color}`}>
                          <Clock size={11} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setReceiveOrder(order)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition">
                          <PackageCheck size={13} /> Recibir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            {filtered.length} orden{filtered.length !== 1 ? "es" : ""} pendiente{filtered.length !== 1 ? "s" : ""} de recepción
          </div>
        </div>
      )}

      {receiveOrder && (
        <ReceiveOrderModal order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onDone={invalidate} />
      )}
    </div>
  );
}
