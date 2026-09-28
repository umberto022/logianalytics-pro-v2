"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Inbox, X, MessageCircle, Phone, Package, Truck, Store, Clock, CheckCircle2, AlertTriangle,
  Send, RefreshCw, Contact,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useCatalogQuotes, useInvalidateCatalogQuotes } from "@/hooks/useCatalogQuotes";
import { useCatalogSettings } from "@/hooks/useCatalogSettings";
import {
  prepareQuote, markQuoteSent, markQuoteAccepted, registerQuoteAdvance,
  markQuoteConfirmed, cancelQuote, convertQuoteToSale,
} from "@/lib/firestore/catalogQuotes";
import { getNotificationJob } from "@/lib/firestore/whatsappNotifications";
import { buildWhatsappLink, buildQuoteMessage, buildConfirmationMessage } from "@/lib/whatsapp";
import { fmtRD, toCents } from "@/lib/money";
import { fmtDatetime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import type { CatalogQuote, CatalogQuoteStatus, WhatsappNotificationJob } from "@/types";

const NOTIF_LABEL: Record<WhatsappNotificationJob["status"], string> = {
  pending: "Aviso pendiente de enviar",
  sent: "Aviso enviado a Meta (no confirma entrega)",
  delivered: "Aviso entregado al teléfono",
  read: "Aviso leído",
  failed: "Aviso de WhatsApp falló",
};

const NOTIF_COLOR: Record<WhatsappNotificationJob["status"], string> = {
  pending: "text-slate-500",
  sent: "text-indigo-600",
  delivered: "text-emerald-600",
  read: "text-emerald-700",
  failed: "text-red-600",
};

function downloadVcf(name: string, phone: string) {
  const vcf = [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${name}`,
    `TEL;TYPE=CELL:${phone}`,
    "END:VCARD",
  ].join("\r\n");
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.trim().replace(/[^a-zA-Z0-9 ]/g, "") || "contacto"}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<CatalogQuoteStatus, string> = {
  recibida: "Recibida",
  preparada: "Preparada",
  enviada: "Enviada",
  aceptada: "Aceptada",
  pendiente_anticipo: "Pendiente de anticipo",
  confirmado: "Confirmado",
  convertida: "Convertida a venta",
  cancelada: "Cancelada",
};

const STATUS_COLOR: Record<CatalogQuoteStatus, string> = {
  recibida: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  preparada: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  enviada: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  aceptada: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  pendiente_anticipo: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  confirmado: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  convertida: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelada: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
};

export default function SolicitudesPage() {
  const { user, profile } = useAuth();
  const { workspaceId, isAdmin } = useRole();
  const { quotes, loading } = useCatalogQuotes();
  const { settings } = useCatalogSettings();
  const invalidate = useInvalidateCatalogQuotes();
  const [selected, setSelected] = useState<CatalogQuote | null>(null);
  const [filter, setFilter] = useState<"activas" | "todas">("activas");

  const filtered = useMemo(() => {
    if (filter === "todas") return quotes;
    return quotes.filter((q) => !["convertida", "cancelada"].includes(q.status));
  }, [quotes, filter]);

  const by = profile?.fullName || profile?.email || "equipo";

  // Enlace autenticado del aviso de WhatsApp: /solicitudes?ref=<quoteId> abre
  // directo el detalle de esa solicitud (requiere la sesión habitual — el
  // enlace en sí no lleva ningún token).
  useEffect(() => {
    if (typeof window === "undefined" || quotes.length === 0) return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      const match = quotes.find((q) => q.id === ref);
      if (match) setSelected(match);
    }
  }, [quotes]);

  async function reload() { invalidate(); if (selected) { /* el detalle se cierra para forzar releer desde la lista */ setSelected(null); } }

  if (loading || !settings) return <div className="space-y-5"><TableSkeleton rows={6} cols={4} /></div>;

  return (
    <div>
      <PageHeader
        title="Solicitudes de cotización"
        subtitle={`${quotes.length} solicitud${quotes.length !== 1 ? "es" : ""} · catálogo de ${settings.businessName}`}
        action={
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(["activas", "todas"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${filter === f ? "bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100" : "text-slate-500"}`}>
                {f === "activas" ? "Activas" : "Todas"}
              </button>
            ))}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Sin solicitudes" description="Todavía no llegó ninguna solicitud desde el catálogo público." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {filtered.map((q) => (
              <button key={q.id} onClick={() => setSelected(q)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{q.customerName}</p>
                    <span className="text-xs text-slate-400 font-mono">{q.publicRef}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {q.items.length} producto(s) · {q.items.reduce((s, it) => s + it.quantity, 0)} unidad(es) · {fmtDatetime(q.createdAt)}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[q.status]}`}>
                  {STATUS_LABEL[q.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && settings && (
        <QuoteDetail
          quote={selected}
          settings={settings}
          workspaceId={workspaceId}
          by={by}
          isAdmin={isAdmin}
          idToken={async () => user?.getIdToken() ?? null}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function ItemsList({ quote }: { quote: CatalogQuote }) {
  return (
    <div className="space-y-1.5">
      {quote.items.map((it, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <div className="min-w-0">
            <p className="text-slate-700 dark:text-slate-200 truncate">
              {it.productName}{it.variantLabel ? ` (${it.variantLabel})` : ""} <span className="text-slate-400">x{it.quantity}</span>
            </p>
            {it.isBackorder && <p className="text-[11px] font-medium text-amber-600">Por encargo — sin stock al momento de la solicitud</p>}
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0">{fmtRD(it.unitPriceCents * it.quantity)}</span>
        </div>
      ))}
    </div>
  );
}

function QuoteDetail({ quote, settings, workspaceId, by, isAdmin, idToken, onClose, onChanged }: {
  quote: CatalogQuote;
  settings: NonNullable<ReturnType<typeof useCatalogSettings>["settings"]>;
  workspaceId: string;
  by: string;
  isAdmin: boolean;
  idToken: () => Promise<string | null>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [shipping, setShipping] = useState(quote.shippingCents !== undefined ? String(quote.shippingCents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(quote.advanceAmountCents ? String(quote.advanceAmountCents / 100) : "");
  const [advanceMethod, setAdvanceMethod] = useState("");
  const [notifJob, setNotifJob] = useState<WhatsappNotificationJob | null>(null);
  const [retryingNotif, setRetryingNotif] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotificationJob(workspaceId, quote.id).then((j) => { if (!cancelled) setNotifJob(j); });
    return () => { cancelled = true; };
  }, [workspaceId, quote.id]);

  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) { toast.success(r.message); onChanged(); } else toast.error(r.message);
  }

  async function retryNotification() {
    setRetryingNotif(true);
    try {
      const token = await idToken();
      if (!token) { toast.error("Sesión no disponible"); return; }
      const res = await fetch("/api/catalogo/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { toast.error(json.error ?? "No se pudo reintentar"); return; }
      toast.success("Reintento enviado");
      const refreshed = await getNotificationJob(workspaceId, quote.id);
      setNotifJob(refreshed);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setRetryingNotif(false);
    }
  }

  const waQuoteLink = settings.whatsappNumber
    ? buildWhatsappLink(quote.customerPhone, buildQuoteMessage(quote, settings))
    : null;
  const waConfirmLink = settings.whatsappNumber
    ? buildWhatsappLink(quote.customerPhone, buildConfirmationMessage(quote, settings))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto dark:bg-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{quote.customerName}</h2>
            <p className="text-xs text-slate-400 font-mono">{quote.publicRef}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700"><X size={18} /></button>
        </div>

        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-4 ${STATUS_COLOR[quote.status]}`}>
          {STATUS_LABEL[quote.status]}
        </span>

        <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 mb-4">
          <div className="flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2"><Phone size={13} className="text-slate-400" /> {quote.customerPhone}</span>
            <button onClick={() => downloadVcf(quote.customerName, quote.customerPhone)}
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline flex-shrink-0">
              <Contact size={13} /> Guardar contacto
            </button>
          </div>
          <div className="flex items-center gap-2">
            {quote.deliveryMethod === "retiro" ? <Store size={13} className="text-slate-400" /> : <Truck size={13} className="text-slate-400" />}
            {quote.deliveryMethod === "retiro" ? "Retiro" : `Entrega · ${quote.zone}${quote.address ? ` · ${quote.address}` : ""}`}
          </div>
          <div className="flex items-center gap-2"><Clock size={13} className="text-slate-400" /> {quote.leadTimeNote}</div>
          {quote.customerNote && <p className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2 text-xs">{quote.customerNote}</p>}
          {notifJob && (
            <div className={`flex items-center justify-between gap-2 text-xs ${NOTIF_COLOR[notifJob.status]}`}>
              <span className="flex items-center gap-1.5">
                <Send size={12} /> {NOTIF_LABEL[notifJob.status]}
                {notifJob.status === "failed" && notifJob.lastErrorSafe && (
                  <span className="text-slate-400"> — {notifJob.lastErrorSafe}</span>
                )}
              </span>
              {notifJob.status === "failed" && (
                <button onClick={retryNotification} disabled={retryingNotif}
                  className="flex items-center gap-1 font-semibold text-brand-600 hover:underline disabled:opacity-50 flex-shrink-0">
                  <RefreshCw size={12} className={retryingNotif ? "animate-spin" : ""} /> Reintentar aviso
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mb-3">
          <p className="text-xs font-semibold text-slate-500 mb-2 dark:text-slate-400">Productos</p>
          <ItemsList quote={quote} />
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-1 text-sm mb-4">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fmtRD(quote.subtotalCents)}</span></div>
          {quote.discountCents > 0 && <div className="flex justify-between text-emerald-600"><span>Descuento ({quote.discountPct}%)</span><span>-{fmtRD(quote.discountCents)}</span></div>}
          <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100"><span>Total productos</span><span>{fmtRD(quote.productsTotalCents)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Envío</span><span>{quote.shippingCents !== undefined ? fmtRD(quote.shippingCents) : "Por cotizar"}</span></div>
          {quote.totalCents !== undefined && <div className="flex justify-between font-bold text-slate-900 dark:text-slate-50"><span>Total</span><span>{fmtRD(quote.totalCents)}</span></div>}
          {quote.requiresAdvance && (
            <div className="flex justify-between text-amber-600 font-medium"><span>Anticipo requerido ({quote.advancePct}%)</span><span>{fmtRD(quote.advanceAmountCents ?? 0)}</span></div>
          )}
          {quote.balanceDueCents !== undefined && <div className="flex justify-between text-slate-500"><span>Saldo</span><span>{fmtRD(quote.balanceDueCents)}</span></div>}
          <p className="text-[11px] text-slate-400 pt-1">Cliente: {quote.customerType === "frecuente" ? "frecuente" : "nuevo"}</p>
        </div>

        {/* Acciones según estado */}
        <div className="space-y-3">
          {(quote.status === "recibida" || quote.status === "preparada") && (
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Envío (RD$, dejar vacío = "por cotizar")</p>
              <div className="flex gap-2">
                <input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="200.00" />
                <button disabled={busy} onClick={() => run(() => prepareQuote(workspaceId, quote.id, {
                  shippingCents: shipping ? toCents(Number(shipping)) : undefined, settings, by,
                }))}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  Preparar
                </button>
              </div>
            </div>
          )}

          {waQuoteLink && ["preparada", "enviada"].includes(quote.status) && (
            <a href={waQuoteLink} target="_blank" rel="noopener noreferrer"
              onClick={() => run(() => markQuoteSent(workspaceId, quote.id, by))}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition">
              <MessageCircle size={16} /> Abrir WhatsApp con la cotización
            </a>
          )}
          {!waQuoteLink && ["preparada", "enviada"].includes(quote.status) && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={13} /> Configurá el WhatsApp del negocio en "Mi catálogo" para generar el mensaje.</p>
          )}

          {["preparada", "enviada"].includes(quote.status) && (
            <button disabled={busy} onClick={() => run(() => markQuoteAccepted(workspaceId, quote.id, by))}
              className="w-full py-2.5 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-50 transition dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
              Registrar aceptación del cliente
            </button>
          )}

          {quote.status === "aceptada" && (
            <button disabled={busy} onClick={() => run(() => markQuoteConfirmed(workspaceId, quote.id, by))}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition">
              Confirmar pedido (pago contra entrega)
            </button>
          )}

          {quote.status === "pendiente_anticipo" && (
            <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Registrar anticipo recibido</p>
              <div className="flex gap-2">
                <input type="number" step="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border border-amber-200 rounded-lg text-sm dark:border-amber-700 dark:bg-slate-800" placeholder="Monto RD$" />
                <input value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)}
                  className="w-32 px-3 py-2 border border-amber-200 rounded-lg text-sm dark:border-amber-700 dark:bg-slate-800" placeholder="Método" />
              </div>
              <button disabled={busy || !advanceAmount} onClick={() => run(() => registerQuoteAdvance(workspaceId, quote.id, {
                amountCents: toCents(Number(advanceAmount)), method: advanceMethod, by,
              }))}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                Registrar anticipo
              </button>
            </div>
          )}

          {quote.status === "confirmado" && (
            <>
              {waConfirmLink && (
                <a href={waConfirmLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-50 transition dark:border-emerald-800 dark:text-emerald-300">
                  <MessageCircle size={16} /> Abrir mensaje de confirmación
                </a>
              )}
              {quote.items.some((it) => it.isBackorder) && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  Hay ítems por encargo — la conversión se bloqueará hasta que haya stock de TODOS los productos (no se vende parcialmente, para no descuadrar descuento/anticipo).
                </p>
              )}
              {isAdmin ? (
                <button disabled={busy} onClick={() => run(() => convertQuoteToSale(workspaceId, quote.id, { by }))}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <Package size={15} /> Convertir en venta
                </button>
              ) : (
                <p className="text-xs text-slate-400 flex items-center gap-1.5 justify-center py-1">
                  <AlertTriangle size={13} /> Solo un administrador puede convertir el pedido en venta (necesita permisos de inventario).
                </p>
              )}
            </>
          )}

          {quote.status === "convertida" && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={16} /> Convertida a venta
            </div>
          )}

          {!["convertida", "cancelada"].includes(quote.status) && (
            <button disabled={busy} onClick={() => run(() => cancelQuote(workspaceId, quote.id, by))}
              className="w-full py-2 text-xs font-semibold text-red-500 hover:underline">
              Cancelar solicitud
            </button>
          )}
        </div>

        {/* Historial */}
        <div className="border-t border-slate-100 dark:border-slate-700 mt-4 pt-3">
          <p className="text-xs font-semibold text-slate-500 mb-1.5 dark:text-slate-400">Historial</p>
          <ul className="space-y-1">
            {quote.history.map((h, i) => (
              <li key={i} className="text-[11px] text-slate-400 flex justify-between gap-2">
                <span>{h.action} — {h.by}{h.note ? ` (${h.note})` : ""}</span>
                <span className="flex-shrink-0">{fmtDatetime(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
