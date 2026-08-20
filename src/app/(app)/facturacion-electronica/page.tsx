"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileText, Send, ExternalLink, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSales } from "@/hooks/useSales";
import { useElectronicInvoices, useInvalidateElectronicInvoices } from "@/hooks/useElectronicInvoices";
import { ECF_STATUS_LABELS, ECF_STATUS_COLOR, defaultECfType } from "@/lib/firestore/einvoicing";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { fmtCurrency, fmtDate } from "@/lib/utils";
import { ECF_TYPE_LABELS, type Sale } from "@/types";

interface SaleGroup {
  key: string;            // saleOrderId, o el propio id si no lo tiene
  saleOrderId?: string;
  saleId?: string;        // solo cuando es una venta suelta (registerSale rápido)
  sales: Sale[];
  total: number;
  client: string;
  clientRnc?: string;
  date: Date;
}

export default function FacturacionElectronicaPage() {
  const { user } = useAuth();
  const { sales, loading: loadingSales } = useSales(30);
  const { invoices, loading: loadingInv } = useElectronicInvoices();
  const invalidate = useInvalidateElectronicInvoices();
  const [emitting, setEmitting] = useState<string | null>(null);

  const invoicedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (["enviado", "aceptado"].includes(inv.status)) {
        if (inv.saleOrderId) set.add(inv.saleOrderId);
        else inv.saleIds.forEach((id) => set.add(id));
      }
    }
    return set;
  }, [invoices]);

  const groups = useMemo<SaleGroup[]>(() => {
    const byOrder = new Map<string, Sale[]>();
    const loose: Sale[] = [];
    for (const s of sales) {
      if (s.saleOrderId) {
        const arr = byOrder.get(s.saleOrderId) ?? [];
        arr.push(s);
        byOrder.set(s.saleOrderId, arr);
      } else {
        loose.push(s);
      }
    }
    const result: SaleGroup[] = [];
    for (const [saleOrderId, group] of Array.from(byOrder)) {
      const first = group[0];
      result.push({
        key: saleOrderId, saleOrderId, sales: group,
        total: group.reduce((s, l) => s + l.totalRevenue, 0),
        client: first.client, clientRnc: first.clientRnc,
        date: first.saleDate.toDate(),
      });
    }
    for (const s of loose) {
      result.push({
        key: s.id, saleId: s.id, sales: [s],
        total: s.totalRevenue, client: s.client, clientRnc: s.clientRnc,
        date: s.saleDate.toDate(),
      });
    }
    return result.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales]);

  const pending = groups.filter((g) => !invoicedKeys.has(g.key));

  async function emit(group: SaleGroup) {
    if (!user) return;
    setEmitting(group.key);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/einvoicing/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          saleOrderId: group.saleOrderId,
          saleId: group.saleId,
          eCfType: defaultECfType(group.clientRnc),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo emitir el e-CF");
      } else {
        toast.success(`e-CF ${data.eNcf} enviado a DGII`);
      }
    } catch {
      toast.error("Error de red al emitir el e-CF");
    } finally {
      setEmitting(null);
      invalidate();
    }
  }

  if (loadingSales || loadingInv) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title="Facturación electrónica"
        subtitle="e-CF vía Alanube — comprobantes fiscales electrónicos ante DGII"
      />

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-700">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <span>
          Módulo en construcción: requiere que la empresa esté inscrita ante DGII como emisor
          electrónico, tenga certificado digital cargado en Alanube, y un rango de e-NCF autorizado
          configurado en Configuración. Sin eso, emitir va a devolver un error explicando qué falta.
        </span>
      </div>

      {/* Ventas pendientes de facturar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700 text-sm">Ventas sin e-CF (últimos 30 días)</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Todo facturado"
            description="No hay ventas de los últimos 30 días pendientes de emitir su e-CF."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map((g) => (
              <div key={g.key} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{g.client || "Consumidor final"}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(g.date)} · {g.sales.length} línea{g.sales.length !== 1 ? "s" : ""}
                    {g.clientRnc ? ` · RNC ${g.clientRnc} → Crédito Fiscal (31)` : " · Sin RNC → Consumo (32)"}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-700">{fmtCurrency(g.total)}</span>
                  <button
                    onClick={() => emit(g)}
                    disabled={emitting === g.key}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition"
                  >
                    <Send size={13} />
                    {emitting === g.key ? "Emitiendo…" : "Emitir e-CF"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de e-CF emitidos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700 text-sm">Comprobantes emitidos</h2>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin comprobantes todavía"
            description="Cuando emitas el primer e-CF, va a aparecer acá con su estado ante DGII."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {inv.buyerName} · {ECF_TYPE_LABELS[inv.eCfType]}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{inv.eNcf ?? "—"}</p>
                  {inv.errorMessage && (
                    <p className="text-xs text-red-500 mt-0.5">{inv.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-700">{fmtCurrency(inv.totalAmount)}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ECF_STATUS_COLOR[inv.status]}`}>
                    {ECF_STATUS_LABELS[inv.status]}
                  </span>
                  {inv.printUrl && (
                    <a href={inv.printUrl} target="_blank" rel="noopener noreferrer"
                      className="text-slate-400 hover:text-brand-600 transition">
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
