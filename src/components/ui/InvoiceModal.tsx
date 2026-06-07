"use client";

import { useState } from "react";
import { X, Printer, Download, CheckCircle2, Clock, CreditCard } from "lucide-react";
import { fmtCurrency } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  client: string;
  route: string;
  zone: string;
  paymentStatus: PaymentStatus;
  dueDate?: Date;
  items: Array<{
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
  }>;
  companyName?: string;
  companyRif?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
}

const PAYMENT_META: Record<PaymentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pagado:    { label: "Pagado",    color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  pendiente: { label: "Pendiente", color: "text-amber-700 bg-amber-50 border-amber-200",       icon: <Clock size={12} /> },
  credito:   { label: "Crédito",   color: "text-blue-700 bg-blue-50 border-blue-200",           icon: <CreditCard size={12} /> },
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

export function InvoiceModal({ data, onClose }: {
  data: InvoiceData;
  onClose: () => void;
}) {
  const [withTax, setWithTax] = useState(false);

  const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tax      = withTax ? subtotal * 0.18 : 0;
  const total    = subtotal + tax;
  const profit   = data.items.reduce((s, i) => s + i.quantity * (i.unitPrice - i.unitCost), 0);
  const margin   = subtotal > 0 ? (profit / subtotal * 100).toFixed(1) : "0";

  const psMeta = PAYMENT_META[data.paymentStatus];

  function buildInvoiceHtml() {
    const rows = data.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return `
        <tr>
          <td>${item.name}</td>
          <td style="color:#64748b;font-size:11px;font-family:monospace">${item.sku}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${fmtCurrency(item.unitPrice)}</td>
          <td style="text-align:right;font-weight:600">${fmtCurrency(lineTotal)}</td>
        </tr>`;
    }).join("");

    const payColor = data.paymentStatus === "pagado" ? "#065f46" : data.paymentStatus === "credito" ? "#1e40af" : "#92400e";
    const payBg    = data.paymentStatus === "pagado" ? "#d1fae5" : data.paymentStatus === "credito" ? "#dbeafe" : "#fef3c7";
    const payLabel = psMeta.label;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Factura ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; padding: 40px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
    .brand h1 { font-size: 22px; font-weight: 800; color: #4f46e5; margin-bottom: 2px; }
    .brand p  { font-size: 11px; color: #64748b; }
    .inv-meta { text-align: right; }
    .inv-meta .inv-num { font-size: 18px; font-weight: 700; color: #1e293b; }
    .inv-meta .inv-date { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; background: ${payBg}; color: ${payColor}; margin-top: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
    .info-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 6px; font-weight: 600; }
    .info-box .value { font-size: 14px; font-weight: 600; color: #1e293b; }
    .info-box .sub   { font-size: 11px; color: #64748b; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #f1f5f9; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #f8fafc; }
    .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-bottom: 28px; }
    .totals .row { display: flex; gap: 60px; font-size: 13px; }
    .totals .row span:first-child { color: #64748b; }
    .totals .row span:last-child  { font-weight: 600; min-width: 90px; text-align: right; }
    .totals .grand { font-size: 16px; font-weight: 800; color: #4f46e5; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 4px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; padding-top: 20px; border-top: 1px solid #f1f5f9; }
    ${withTax ? "" : ".tax-row { display: none; }"}
    @media print {
      body { padding: 24px; }
      @page { margin: 16mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>${data.companyName || "LogiAnalytics Pro"}</h1>
      <p>${data.companyRif ? `RIF/RNC: ${data.companyRif}` : ""}</p>
      <p>${data.companyPhone || ""} ${data.companyEmail ? `· ${data.companyEmail}` : ""}</p>
      ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ""}
    </div>
    <div class="inv-meta">
      <div class="inv-num">FACTURA</div>
      <div style="font-size:15px;font-weight:600;color:#4f46e5;margin-top:2px">${data.invoiceNumber}</div>
      <div class="inv-date">Fecha: ${fmtDate(data.date)}</div>
      <div class="badge">${payLabel}</div>
      ${data.dueDate ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px">Vence: ${fmtDate(data.dueDate)}</div>` : ""}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="label">Cliente</div>
      <div class="value">${data.client || "—"}</div>
    </div>
    <div class="info-box">
      <div class="label">Ruta / Zona</div>
      <div class="value">${data.route || "—"}</div>
      ${data.zone ? `<div class="sub">${data.zone}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>SKU</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">Precio unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>
    <div class="row tax-row"><span>ITBIS 18%</span><span>${fmtCurrency(tax)}</span></div>
    <div class="row grand"><span>TOTAL</span><span>${fmtCurrency(total)}</span></div>
  </div>

  <div class="footer">
    <p>Gracias por su compra · ${data.companyName || "LogiAnalytics Pro"}</p>
    <p style="margin-top:4px">Documento generado el ${fmtDate(new Date())}</p>
  </div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;
  }

  function openPrint() {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(buildInvoiceHtml());
    win.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Factura generada</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{data.invoiceNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={withTax} onChange={(e) => setWithTax(e.target.checked)}
                className="rounded" />
              ITBIS 18%
            </label>
            <button onClick={openPrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition">
              <Printer size={13} /> Imprimir / PDF
            </button>
            <button onClick={openPrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl hover:bg-brand-700 transition">
              <Download size={13} /> Descargar
            </button>
            <button onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Invoice preview */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm font-sans">

            {/* Invoice header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-slate-100">
              <div>
                <h1 className="text-2xl font-extrabold text-indigo-600">{data.companyName || "LogiAnalytics Pro"}</h1>
                {data.companyRif && <p className="text-xs text-slate-400 mt-0.5">RIF/RNC: {data.companyRif}</p>}
                {(data.companyPhone || data.companyEmail) && (
                  <p className="text-xs text-slate-400">{data.companyPhone}{data.companyEmail ? ` · ${data.companyEmail}` : ""}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Factura</p>
                <p className="text-xl font-bold text-indigo-600 mt-0.5">{data.invoiceNumber}</p>
                <p className="text-xs text-slate-400 mt-1">{fmtDate(data.date)}</p>
                <span className={`mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${psMeta.color}`}>
                  {psMeta.icon} {psMeta.label}
                </span>
                {data.dueDate && (
                  <p className="text-xs text-slate-400 mt-1">Vence: {fmtDate(data.dueDate)}</p>
                )}
              </div>
            </div>

            {/* Client / route */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "Cliente",    value: data.client  || "—" },
                { label: "Ruta / Zona", value: [data.route, data.zone].filter(Boolean).join(" · ") || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
                  <p className="text-sm font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            {/* Items table */}
            <table className="w-full text-sm mb-5">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left py-2.5 px-3 rounded-l-lg font-semibold">Producto</th>
                  <th className="text-left py-2.5 px-3 font-semibold">SKU</th>
                  <th className="text-center py-2.5 px-3 font-semibold">Cant.</th>
                  <th className="text-right py-2.5 px-3 font-semibold">Precio u.</th>
                  <th className="text-right py-2.5 px-3 rounded-r-lg font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{item.sku}</td>
                    <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-right">{fmtCurrency(item.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex flex-col items-end gap-1.5 mb-6">
              <div className="flex gap-16 text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800 w-28 text-right">{fmtCurrency(subtotal)}</span>
              </div>
              {withTax && (
                <div className="flex gap-16 text-sm text-slate-500">
                  <span>ITBIS 18%</span>
                  <span className="font-semibold text-slate-800 w-28 text-right">{fmtCurrency(tax)}</span>
                </div>
              )}
              <div className="flex gap-16 text-base font-bold border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-800">TOTAL</span>
                <span className="text-indigo-600 w-28 text-right">{fmtCurrency(total)}</span>
              </div>
            </div>

            {/* Margin note (internal, won't print) */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-700 print:hidden">
              <span>Ganancia estimada (interno)</span>
              <span className="font-bold">{fmtCurrency(profit)} · {margin}% margen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
