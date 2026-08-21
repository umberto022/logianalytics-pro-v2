"use client";

import { useState } from "react";
import { X, Printer, Download, CheckCircle2, Clock, CreditCard, FileText } from "lucide-react";
import { fmtCurrency } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

export interface InvoiceData {
  invoiceNumber: string;
  ncf?: string;
  date: Date;
  dueDate?: Date;
  // Client
  client: string;
  clientRnc?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  // Order
  route: string;
  zone: string;
  paymentStatus: PaymentStatus;
  notes?: string;
  items: Array<{
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
  }>;
  // Company
  companyName?: string;
  companyRif?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
}

const NCF_LABELS: Record<string, string> = {
  B01: "B01 – Crédito Fiscal",
  B02: "B02 – Consumidor Final",
  B14: "B14 – Régimen Especial",
  B15: "B15 – Gubernamental",
};

const PAYMENT_META: Record<PaymentStatus, { label: string; color: string; printColor: string; icon: React.ReactNode }> = {
  pagado:    { label: "Contado / Pagado",  color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", printColor: "#065f46", icon: <CheckCircle2 size={12} /> },
  pendiente: { label: "Pendiente de Pago", color: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",       printColor: "#92400e", icon: <Clock size={12} /> },
  credito:   { label: "Crédito",           color: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",           printColor: "#1e40af", icon: <CreditCard size={12} /> },
};

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function InvoiceModal({ data, onClose }: { data: InvoiceData; onClose: () => void }) {
  const [withTax, setWithTax] = useState(false);

  const subtotalBase = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itbis        = withTax ? +(subtotalBase * 0.18).toFixed(2) : 0;
  const subtotalExcl = withTax ? +(subtotalBase / 1.18).toFixed(2) : subtotalBase;
  const total        = subtotalBase + itbis;
  const totalProfit  = data.items.reduce((s, i) => s + i.quantity * (i.unitPrice - i.unitCost), 0);
  const margin       = subtotalBase > 0 ? (totalProfit / subtotalBase * 100).toFixed(1) : "0";

  const psMeta  = PAYMENT_META[data.paymentStatus];
  const ncfType = data.ncf?.slice(0, 3) ?? "B02";
  const ncfLabel = NCF_LABELS[ncfType] ?? data.ncf ?? "B02 – Consumidor Final";

  function buildHtml() {
    const rows = data.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const lineItbis = withTax ? +(lineTotal / 1.18 * 0.18).toFixed(2) : 0;
      return `
        <tr>
          <td>${item.name}<br/><span class="sku">${item.sku}</span></td>
          <td class="center">${item.quantity}</td>
          <td class="right">${fmtCurrency(item.unitPrice)}</td>
          ${withTax ? `<td class="right">${fmtCurrency(lineItbis)}</td>` : ""}
          <td class="right bold">${fmtCurrency(lineTotal)}</td>
        </tr>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Factura ${data.invoiceNumber}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1e293b;background:#fff;padding:32px}
    /* ── Header ── */
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #4f46e5;margin-bottom:20px}
    .company h1{font-size:20px;font-weight:800;color:#4f46e5;margin-bottom:4px}
    .company p{font-size:11px;color:#64748b;line-height:1.6}
    .inv-box{text-align:right}
    .inv-box .title{font-size:24px;font-weight:900;color:#1e293b;letter-spacing:2px}
    .inv-box .num{font-size:14px;font-weight:700;color:#4f46e5;margin-top:2px}
    .inv-box .meta{font-size:10px;color:#94a3b8;margin-top:4px;line-height:1.6}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;margin-top:6px;background:${psMeta.printColor}22;color:${psMeta.printColor};border:1px solid ${psMeta.printColor}44}
    /* ── NCF Box ── */
    .ncf-bar{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #4f46e5;border-radius:4px;padding:8px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;font-size:11px}
    .ncf-bar .ncf-label{color:#64748b}
    .ncf-bar .ncf-val{font-weight:700;color:#1e293b;font-family:monospace;font-size:12px}
    /* ── Info grid ── */
    .info{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
    .box .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-bottom:6px}
    .box p{font-size:12px;color:#1e293b;line-height:1.6}
    .box .main{font-weight:700;font-size:13px}
    /* ── Table ── */
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#4f46e5}
    th{padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#fff;font-weight:600}
    th.center,td.center{text-align:center}
    th.right,td.right{text-align:right}
    td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:12px}
    td .sku{font-size:10px;color:#94a3b8;font-family:monospace}
    td.bold{font-weight:700}
    tbody tr:nth-child(even){background:#f8fafc}
    /* ── Totals ── */
    .totals{display:flex;flex-direction:column;align-items:flex-end;gap:5px;margin-bottom:20px}
    .totals .row{display:flex;gap:48px;font-size:12px;min-width:260px;justify-content:space-between}
    .totals .row span:last-child{font-weight:600;text-align:right;min-width:100px}
    .totals .grand{font-size:16px;font-weight:800;color:#4f46e5;border-top:2px solid #e2e8f0;padding-top:10px;margin-top:4px}
    /* ── Footer ── */
    .conditions{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:10px;color:#64748b;line-height:1.7}
    .conditions b{color:#1e293b}
    .footer{text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px}
    @media print{body{padding:20px}@page{margin:14mm;size:A4}}
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="company">
      <h1>${data.companyName || "Mi Empresa"}</h1>
      ${data.companyRif ? `<p><b>RNC:</b> ${data.companyRif}</p>` : ""}
      ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ""}
      ${data.companyPhone ? `<p>Tel: ${data.companyPhone}</p>` : ""}
      ${data.companyEmail ? `<p>${data.companyEmail}</p>` : ""}
    </div>
    <div class="inv-box">
      <div class="title">FACTURA</div>
      <div class="num">${data.invoiceNumber}</div>
      <div class="meta">
        Fecha: ${fmtDateLong(data.date)}<br/>
        ${data.dueDate ? `Vence: ${fmtDateShort(data.dueDate)}<br/>` : ""}
        ${data.route ? `Ruta: ${data.route}${data.zone ? " · " + data.zone : ""}` : ""}
      </div>
      <div class="badge">${psMeta.label}</div>
    </div>
  </div>

  <!-- NCF -->
  <div class="ncf-bar">
    <span class="ncf-label">Comprobante Fiscal (NCF)</span>
    <span class="ncf-val">${data.ncf ?? "—"}&nbsp;&nbsp;|&nbsp;&nbsp;${ncfLabel}</span>
  </div>

  <!-- Info -->
  <div class="info">
    <div class="box">
      <div class="lbl">Datos del cliente</div>
      <p class="main">${data.client || "—"}</p>
      ${data.clientRnc ? `<p><b>RNC/Céd:</b> ${data.clientRnc}</p>` : ""}
      ${data.clientAddress ? `<p>${data.clientAddress}</p>` : ""}
      ${data.clientPhone ? `<p>Tel: ${data.clientPhone}</p>` : ""}
      ${data.clientEmail ? `<p>${data.clientEmail}</p>` : ""}
    </div>
    <div class="box">
      <div class="lbl">Condición de pago</div>
      <p class="main">${psMeta.label}</p>
      ${data.dueDate ? `<p>Vence: ${fmtDateShort(data.dueDate)}</p>` : ""}
      ${data.notes ? `<p style="margin-top:6px;color:#64748b">${data.notes}</p>` : ""}
    </div>
  </div>

  <!-- Items -->
  <table>
    <thead>
      <tr>
        <th>Descripción / SKU</th>
        <th class="center">Cant.</th>
        <th class="right">Precio unit.</th>
        ${withTax ? `<th class="right">ITBIS 18%</th>` : ""}
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    ${withTax ? `<div class="row"><span>Subtotal (excl. ITBIS)</span><span>${fmtCurrency(subtotalExcl)}</span></div>` : `<div class="row"><span>Subtotal</span><span>${fmtCurrency(subtotalBase)}</span></div>`}
    ${withTax ? `<div class="row"><span>ITBIS 18%</span><span>${fmtCurrency(itbis)}</span></div>` : ""}
    <div class="row grand"><span>TOTAL</span><span>${fmtCurrency(total)}</span></div>
  </div>

  <!-- Conditions -->
  <div class="conditions">
    <b>Condiciones:</b> ${psMeta.label}
    ${data.dueDate ? ` · Fecha límite de pago: ${fmtDateShort(data.dueDate)}` : ""}
    · Esta factura es un comprobante válido de transacción comercial.
    ${data.notes ? `<br/><b>Notas:</b> ${data.notes}` : ""}
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>${data.companyName || "Mi Empresa"} · Documento generado el ${fmtDateLong(new Date())}</p>
    <p style="margin-top:3px">Gracias por su preferencia</p>
  </div>

  <script>window.onload=()=>window.print()<\/script>
</body>
</html>`;
  }

  function openPrint() {
    const win = window.open("", "_blank", "width=960,height=720");
    if (!win) return;
    win.document.write(buildHtml());
    win.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden dark:bg-slate-800">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 flex-shrink-0 bg-slate-50 rounded-t-3xl dark:border-slate-700 dark:bg-slate-700/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <FileText size={15} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm dark:text-slate-100">{data.invoiceNumber}</p>
              {data.ncf && <p className="text-xs text-slate-400 font-mono dark:text-slate-400">{data.ncf}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none px-2 dark:text-slate-400">
              <input type="checkbox" checked={withTax} onChange={(e) => setWithTax(e.target.checked)} className="rounded accent-indigo-600" />
              ITBIS 18%
            </label>
            <button onClick={openPrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition">
              <Printer size={13} /> Imprimir
            </button>
            <button onClick={openPrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition">
              <Download size={13} /> PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition text-slate-400 ml-1 dark:hover:bg-slate-700 dark:text-slate-500">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Preview ── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm dark:bg-slate-800 dark:border-slate-700">

            {/* Header */}
            <div className="flex justify-between items-start pb-5 border-b-4 border-indigo-600 mb-5">
              <div>
                <h1 className="text-xl font-extrabold text-indigo-600">{data.companyName || "Mi Empresa"}</h1>
                {data.companyRif     && <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">RNC: {data.companyRif}</p>}
                {data.companyAddress && <p className="text-xs text-slate-400 dark:text-slate-400">{data.companyAddress}</p>}
                {(data.companyPhone || data.companyEmail) && (
                  <p className="text-xs text-slate-400 dark:text-slate-400">
                    {data.companyPhone}{data.companyEmail ? ` · ${data.companyEmail}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-slate-900 tracking-widest dark:text-slate-100">FACTURA</p>
                <p className="text-sm font-bold text-indigo-600 mt-0.5">{data.invoiceNumber}</p>
                <p className="text-xs text-slate-400 mt-1 dark:text-slate-400">{fmtDateLong(data.date)}</p>
                {data.dueDate && <p className="text-xs text-slate-400 dark:text-slate-400">Vence: {fmtDateShort(data.dueDate)}</p>}
                <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${psMeta.color}`}>
                  {psMeta.icon} {psMeta.label}
                </span>
              </div>
            </div>

            {/* NCF bar */}
            {data.ncf && (
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 border-l-4 border-l-indigo-600 rounded-lg px-4 py-2.5 mb-5 dark:bg-indigo-500/15 dark:border-indigo-500/30">
                <span className="text-xs text-slate-500 font-medium dark:text-slate-400">Comprobante Fiscal (NCF)</span>
                <span className="font-mono text-sm font-bold text-indigo-700 tracking-wider dark:text-indigo-300">
                  {data.ncf}
                  <span className="ml-2 text-xs font-normal text-indigo-400 dark:text-indigo-300">· {ncfLabel}</span>
                </span>
              </div>
            )}

            {/* Client + payment grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5 dark:bg-slate-700/40 dark:border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2 dark:text-slate-400">Datos del cliente</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{data.client || "—"}</p>
                {data.clientRnc     && <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">RNC/Céd: {data.clientRnc}</p>}
                {data.clientAddress && <p className="text-xs text-slate-500 dark:text-slate-400">{data.clientAddress}</p>}
                {data.clientPhone   && <p className="text-xs text-slate-500 dark:text-slate-400">Tel: {data.clientPhone}</p>}
                {data.clientEmail   && <p className="text-xs text-slate-500 dark:text-slate-400">{data.clientEmail}</p>}
                {(data.route || data.zone) && (
                  <p className="text-xs text-slate-400 mt-1 dark:text-slate-400">
                    Ruta: {[data.route, data.zone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5 dark:bg-slate-700/40 dark:border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2 dark:text-slate-400">Condición de pago</p>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${psMeta.color}`}>
                  {psMeta.icon} {psMeta.label}
                </span>
                {data.dueDate && <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">Fecha límite: {fmtDateShort(data.dueDate)}</p>}
                {data.notes && <p className="text-xs text-slate-400 mt-2 italic dark:text-slate-400">"{data.notes}"</p>}
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-xl overflow-hidden border border-slate-100 mb-5 dark:border-slate-700">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-indigo-600 text-white text-xs uppercase tracking-wide">
                    <th className="text-left py-2.5 px-3 font-semibold">Descripción</th>
                    <th className="text-center py-2.5 px-3 font-semibold">Cant.</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Precio u.</th>
                    {withTax && <th className="text-right py-2.5 px-3 font-semibold">ITBIS 18%</th>}
                    <th className="text-right py-2.5 px-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => {
                    const lineTotal = item.quantity * item.unitPrice;
                    const lineItbis = withTax ? +(lineTotal / 1.18 * 0.18).toFixed(2) : 0;
                    return (
                      <tr key={i} className={i % 2 === 1 ? "bg-slate-50 dark:bg-slate-700/40" : "bg-white dark:bg-slate-800"}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                          <p className="text-xs text-slate-400 font-mono dark:text-slate-400">{item.sku}</p>
                        </td>
                        <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right">{fmtCurrency(item.unitPrice)}</td>
                        {withTax && <td className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">{fmtCurrency(lineItbis)}</td>}
                        <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-1.5 mb-5">
              {withTax ? (
                <>
                  <div className="flex gap-12 text-sm text-slate-500 w-64 justify-between dark:text-slate-400">
                    <span>Subtotal (excl. ITBIS)</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtCurrency(subtotalExcl)}</span>
                  </div>
                  <div className="flex gap-12 text-sm text-amber-600 w-64 justify-between dark:text-amber-400">
                    <span>ITBIS 18%</span>
                    <span className="font-semibold">{fmtCurrency(itbis)}</span>
                  </div>
                </>
              ) : (
                <div className="flex gap-12 text-sm text-slate-500 w-64 justify-between dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtCurrency(subtotalBase)}</span>
                </div>
              )}
              <div className="flex gap-12 font-black text-base border-t-2 border-slate-200 pt-2 mt-1 w-64 justify-between text-indigo-600 dark:border-slate-700">
                <span>TOTAL</span>
                <span>{fmtCurrency(total)}</span>
              </div>
            </div>

            {/* Internal margin note — screen only */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300">
              <span className="font-medium">Ganancia estimada (solo visible internamente)</span>
              <span className="font-bold">{fmtCurrency(totalProfit)} · {margin}% margen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
