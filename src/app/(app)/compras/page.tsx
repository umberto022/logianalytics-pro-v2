"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus, X, Search, Printer, Trash2, CheckCircle2,
  Clock, PackageCheck, XCircle, ChevronDown, ChevronUp,
  ShoppingBag, DollarSign, TruckIcon, AlertTriangle,
  Edit2, FileText, Package,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminButton } from "@/components/ui/AdminOnly";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ReceiveOrderModal } from "@/components/ui/ReceiveOrderModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { listInventory } from "@/lib/firestore/inventory";
import { type Supplier } from "@/lib/firestore/suppliers";
import {
  listPurchaseOrders, createPurchaseOrder,
  deletePurchaseOrder, updatePurchaseOrder,
} from "@/lib/firestore/purchases";
import { useSuppliers } from "@/hooks/useSuppliers";
import { purchaseOrderSchema, zodErrors } from "@/lib/schemas";
import { fmtCurrency, fmt } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { Timestamp } from "firebase/firestore";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, InventoryItem } from "@/types";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<PurchaseOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente:  { label: "Pendiente",  color: "bg-amber-50 text-amber-700 border-amber-200",   icon: <Clock size={12} /> },
  recibida:   { label: "Recibida",   color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  parcial:    { label: "Parcial",    color: "bg-blue-50 text-blue-700 border-blue-200",      icon: <PackageCheck size={12} /> },
  cancelada:  { label: "Cancelada",  color: "bg-red-50 text-red-700 border-red-200",         icon: <XCircle size={12} /> },
};

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Print order ──────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printOrder(order: PurchaseOrder) {
  const rows = order.items.map((i) =>
    `<tr>
      <td>${esc(i.sku)}</td><td>${esc(i.productName)}</td><td>${esc(i.category)}</td>
      <td style="text-align:center">${i.qtyOrdered}</td>
      <td style="text-align:center">${i.qtyReceived}</td>
      <td style="text-align:right">${fmtCurrency(i.unitCost)}</td>
      <td style="text-align:right">${fmtCurrency(i.total)}</td>
    </tr>`
  ).join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <html><head><title>Orden ${order.orderNumber}</title>
    <style>
      body{font-family:sans-serif;padding:28px;color:#1e293b;font-size:13px}
      h1{font-size:22px;margin:0}
      .header{display:flex;justify-content:space-between;margin-bottom:20px}
      .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
        background:${order.status==="recibida"?"#d1fae5":order.status==="cancelada"?"#fee2e2":"#fef3c7"};
        color:${order.status==="recibida"?"#065f46":order.status==="cancelada"?"#991b1b":"#92400e"}}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
      .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px}
      .info-box p{margin:0;font-size:11px;color:#64748b}.info-box b{display:block;font-size:14px;color:#1e293b;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      td{padding:8px 10px;border-bottom:1px solid #f1f5f9}
      .totals{margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
      .totals div{display:flex;gap:48px;font-size:13px}
      .totals .grand{font-weight:700;font-size:15px;border-top:2px solid #e2e8f0;padding-top:8px;margin-top:4px}
    </style></head>
    <body>
      <div class="header">
        <div>
          <h1>Orden de Compra</h1>
          <p style="color:#64748b;margin:4px 0 8px">${esc(order.orderNumber)}</p>
          <span class="badge">${esc(STATUS_META[order.status].label)}</span>
        </div>
        <div style="text-align:right">
          <p style="margin:0;font-size:11px;color:#64748b">Fecha de creación</p>
          <p style="margin:0;font-weight:600">${order.createdAt?.toDate?.()?.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})??""}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#64748b">Fecha esperada</p>
          <p style="margin:0;font-weight:600">${order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})??""}</p>
        </div>
      </div>
      <div class="info">
        <div class="info-box">
          <p>Proveedor</p><b>${esc(order.supplierName)}</b>
          ${order.supplierRnc ? `<p style="margin-top:6px">RNC</p><b>${esc(order.supplierRnc)}</b>` : ""}
        </div>
        <div class="info-box">
          ${order.supplierPhone ? `<p>Teléfono</p><b>${esc(order.supplierPhone)}</b>` : ""}
          ${order.supplierEmail ? `<p style="margin-top:6px">Email</p><b>${esc(order.supplierEmail)}</b>` : ""}
        </div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Cant. pedida</th><th>Cant. recibida</th><th>Costo unit.</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div><span style="color:#64748b">Subtotal</span><span>${fmtCurrency(order.subtotal)}</span></div>
        <div><span style="color:#64748b">ITBIS (18%)</span><span>${fmtCurrency(order.tax)}</span></div>
        <div class="grand"><span>TOTAL</span><span>${fmtCurrency(order.total)}</span></div>
      </div>
      ${order.note ? `<p style="margin-top:16px;padding:10px;background:#f8fafc;border-radius:6px;color:#64748b;font-size:12px"><b>Nota:</b> ${esc(order.note)}</p>` : ""}
    </body></html>`);
  win.document.close();
  win.print();
}

// ─── Order detail modal ───────────────────────────────────────────────────────

function OrderDetailModal({ order, onClose, onReceive, onDelete, onEdit, canReceiveOrders }: {
  order: PurchaseOrder;
  onClose: () => void;
  onReceive: (o: PurchaseOrder) => void;
  onDelete: (id: string) => void;
  onEdit: (o: PurchaseOrder) => void;
  canReceiveOrders: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const canReceive = canReceiveOrders && (order.status === "pendiente" || order.status === "parcial");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs text-slate-400 font-mono">{order.orderNumber}</p>
            <h2 className="text-lg font-bold text-slate-900">{order.supplierName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition"><X size={16} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Supplier info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "RNC / ID fiscal", value: order.supplierRnc || "—" },
              { label: "Teléfono", value: order.supplierPhone || "—" },
              { label: "Email", value: order.supplierEmail || "—" },
              { label: "Fecha esperada", value: order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "—" },
              { label: "Fecha creación", value: order.createdAt?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "—" },
              { label: "Fecha recepción", value: order.receivedDate?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "Pendiente" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Items */}
          <div>
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 w-full text-left">
              <Package size={15} /> Productos ({order.items.length})
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expanded && (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="text-left py-2.5 px-3 font-medium">Producto</th>
                      <th className="text-left py-2.5 px-3 font-medium">SKU</th>
                      <th className="text-center py-2.5 px-3 font-medium">Pedido</th>
                      <th className="text-center py-2.5 px-3 font-medium">Recibido</th>
                      <th className="text-right py-2.5 px-3 font-medium">Costo u.</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-2.5 px-3 font-medium">{item.productName}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{item.sku}</td>
                        <td className="py-2.5 px-3 text-center">{item.qtyOrdered}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`font-semibold ${item.qtyReceived >= item.qtyOrdered ? "text-emerald-600" : item.qtyReceived > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {item.qtyReceived}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{fmtCurrency(item.unitCost)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>{fmtCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-600"><span>ITBIS (18%)</span><span>{fmtCurrency(order.tax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2"><span>Total</span><span className="text-brand-600">{fmtCurrency(order.total)}</span></div>
          </div>

          {order.note && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
              <b>Nota:</b> {order.note}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => printOrder(order)}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
              <Printer size={14} /> Imprimir
            </button>
            {canReceive && (
              <button onClick={() => { onReceive(order); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
                <PackageCheck size={14} /> Registrar recepción
              </button>
            )}
            {order.status === "pendiente" && (
              <button onClick={() => { onEdit(order); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
                <Edit2 size={14} /> Editar
              </button>
            )}
            {order.status !== "recibida" && (
              <AdminButton onClick={() => { onDelete(order.id); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2.5 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition ml-auto">
                <Trash2 size={14} /> Eliminar
              </AdminButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Receive modal ────────────────────────────────────────────────────────────

// ReceiveModal replaced by ReceiveOrderModal component

// ─── New / Edit order modal ───────────────────────────────────────────────────

const EMPTY_ORDER = {
  supplierId: "", supplierName: "", supplierRnc: "",
  supplierPhone: "", supplierEmail: "", note: "",
  expectedDate: "", status: "pendiente" as PurchaseOrderStatus,
};

function OrderFormModal({ inventory, editOrder, preloadItems, suppliers, onClose, onDone }: {
  inventory: InventoryItem[];
  editOrder: PurchaseOrder | null;
  preloadItems?: PurchaseOrder["items"] | null;
  suppliers: Supplier[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const [fields, setFields] = useState(editOrder ? {
    supplierId: editOrder.supplierId,
    supplierName: editOrder.supplierName,
    supplierRnc: editOrder.supplierRnc,
    supplierPhone: editOrder.supplierPhone,
    supplierEmail: editOrder.supplierEmail,
    note: editOrder.note,
    expectedDate: editOrder.expectedDate?.toDate?.()?.toISOString().slice(0, 10) ?? "",
    status: editOrder.status,
  } : EMPTY_ORDER);

  const initialItems = editOrder
    ? editOrder.items.map((i) => ({ ...i, _inventoryId: i.inventoryId }))
    : preloadItems
      ? preloadItems.map((i) => ({ ...i, _inventoryId: i.inventoryId }))
      : [];

  const [items, setItems] = useState<(PurchaseOrderItem & { _inventoryId: string })[]>(
    initialItems
  );
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [productSearch, setProductSearch] = useState("");

  const TAX_RATE = 0.18;
  const subtotal  = items.reduce((s, i) => s + i.total, 0);
  const tax       = subtotal * TAX_RATE;
  const total     = subtotal + tax;

  const filteredInv = inventory.filter((p) =>
    !items.find((i) => i.inventoryId === p.id) &&
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  function addProduct(p: InventoryItem) {
    setItems((prev) => [...prev, {
      inventoryId: p.id, sku: p.sku, productName: p.name,
      category: p.category, qtyOrdered: 1, qtyReceived: 0,
      unitCost: p.unitCost, total: p.unitCost, _inventoryId: p.id,
    }]);
    setProductSearch("");
  }

  function updateItem(idx: number, key: "qtyOrdered" | "unitCost", val: number) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [key]: val };
      updated.total = updated.qtyOrdered * updated.unitCost;
      return updated;
    }));
  }

  function setF(k: keyof typeof EMPTY_ORDER) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setFields((p) => ({ ...p, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = purchaseOrderSchema.safeParse(fields);
    if (!parsed.success) {
      setFieldErrors(zodErrors(parsed));
      toast.error("Corrige los errores del formulario");
      return;
    }
    if (items.length === 0) { toast.error("Agrega al menos un producto"); return; }
    setFieldErrors({});

    setSaving(true);
    const payload = {
      ...fields,
      items,
      subtotal,
      tax,
      total,
      expectedDate: Timestamp.fromDate(new Date(fields.expectedDate)),
    };

    const r = editOrder
      ? await updatePurchaseOrder(workspaceId, editOrder.id, payload)
      : await createPurchaseOrder(workspaceId, payload);

    setSaving(false);
    if (r.ok) { toast.success(r.message); onDone(); onClose(); }
    else toast.error(r.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="font-bold text-slate-900">{editOrder ? "Editar orden" : "Nueva orden de compra"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Supplier */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <TruckIcon size={14} /> Datos del proveedor
            </h3>
            {suppliers.filter(s => s.active).length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">Seleccionar de mis proveedores</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const s = suppliers.find(s => s.id === e.target.value);
                    if (s) setFields(p => ({ ...p, supplierId: s.id, supplierName: s.name, supplierRnc: s.rnc, supplierPhone: s.phone, supplierEmail: s.email }));
                  }}
                  className="w-full px-3 py-2 border border-brand-200 bg-brand-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Elegir proveedor guardado —</option>
                  {suppliers.filter(s => s.active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.rnc ? ` · ${s.rnc}` : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Nombre del proveedor *", key: "supplierName" as const, placeholder: "ej. Distribuidora ABC" },
                { label: "RNC / ID fiscal",        key: "supplierRnc"  as const, placeholder: "ej. 1-31-12345-6" },
                { label: "Teléfono",               key: "supplierPhone" as const, placeholder: "ej. 809-555-0000" },
                { label: "Email",                  key: "supplierEmail" as const, placeholder: "compras@proveedor.com" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input value={fields[key]} onChange={setF(key)} placeholder={placeholder}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${fieldErrors[key] ? "border-red-400" : "border-slate-200"}`} />
                  {fieldErrors[key] && <p className="text-xs text-red-500 mt-0.5">{fieldErrors[key]}</p>}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha esperada de entrega *</label>
                <input type="date" value={fields.expectedDate} onChange={setF("expectedDate")}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${fieldErrors.expectedDate ? "border-red-400" : "border-slate-200"}`} />
                {fieldErrors.expectedDate && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.expectedDate}</p>}
              </div>
              {editOrder && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                  <select value={fields.status} onChange={setF("status")}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {(["pendiente","parcial","recibida","cancelada"] as PurchaseOrderStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Products */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Package size={14} /> Productos a comprar
            </h3>

            {/* Product search */}
            <div className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto del inventario…"
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {productSearch && (
                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden">
                  {filteredInv.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
                  ) : (
                    filteredInv.slice(0, 8).map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand-50 text-sm flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors">
                        <span className="font-medium text-slate-800">{p.name}
                          <span className="text-slate-400 font-mono text-xs ml-1.5">· {p.sku}</span>
                        </span>
                        <span className="text-slate-500 text-xs ml-4 flex-shrink-0">{fmtCurrency(p.unitCost)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
                Busca y selecciona productos del inventario
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="text-left py-2.5 px-3 font-medium">Producto</th>
                      <th className="text-center py-2.5 px-3 font-medium">Cantidad</th>
                      <th className="text-right py-2.5 px-3 font-medium">Costo unit.</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total</th>
                      <th className="py-2.5 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-50">
                        <td className="py-2.5 px-3">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <input type="number" min={1} value={item.qtyOrdered}
                            onChange={(e) => updateItem(idx, "qtyOrdered", Number(e.target.value))}
                            className="w-20 text-center border border-slate-200 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mx-auto block" />
                        </td>
                        <td className="py-2.5 px-3">
                          <input type="number" min={0} step="0.01" value={item.unitCost}
                            onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                            className="w-24 text-right border border-slate-200 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ml-auto block" />
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(item.total)}</td>
                        <td className="py-2.5 px-3">
                          <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                            className="p-1 hover:text-red-600 hover:bg-red-50 rounded transition text-slate-400">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-slate-50 px-3 py-2.5 border-t border-slate-100 space-y-1">
                  <div className="flex justify-between text-xs text-slate-500"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-slate-500"><span>ITBIS 18%</span><span>{fmtCurrency(tax)}</span></div>
                  <div className="flex justify-between text-sm font-bold text-slate-900"><span>Total</span><span className="text-brand-600">{fmtCurrency(total)}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nota interna <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea value={fields.note} onChange={setF("note")} rows={2}
              placeholder="Instrucciones de entrega, condiciones especiales…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
              {saving ? "Guardando…" : editOrder ? "Guardar cambios" : "Crear orden de compra"}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComprasPage() {
  const { user } = useAuth();
  const { workspaceId, can } = useRole();
  const [orders,    setOrders]    = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "all">("all");

  const [showForm,    setShowForm]    = useState(false);
  const [editOrder,   setEditOrder]   = useState<PurchaseOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  const { suppliers } = useSuppliers();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [o, i] = await Promise.all([listPurchaseOrders(workspaceId), listInventory(workspaceId)]);
      setOrders(o); setInventory(i);
    } catch { toast.error("Error al cargar datos"); }
    finally { setLoading(false); }
  }, [user]);

  // Open form pre-filled when coming from inventario/reabastecer
  const [preloadItems, setPreloadItems] = useState<PurchaseOrder["items"] | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("compras_preload");
    if (raw) {
      try {
        setPreloadItems(JSON.parse(raw));
        setShowForm(true);
      } catch { /* ignore */ }
      localStorage.removeItem("compras_preload");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleDelete(id: string) {
    setConfirmDeleteId(id);
  }

  async function doDelete() {
    if (!confirmDeleteId || !user) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const r = await deletePurchaseOrder(workspaceId, id);
    if (r.ok) { toast.success(r.message); load(); }
    else toast.error(r.message);
  }

  function openEdit(o: PurchaseOrder) { setEditOrder(o); setShowForm(true); }

  const filtered = orders.filter((o) => {
    const matchSearch = !search ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      o.supplierRnc.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const { paged: pagedOrders, page: ordersPage, totalPages: ordersTotalPages,
          setPage: setOrdersPage, total: ordersTotal } = usePagination(filtered, 20);

  // KPIs
  const totalSpent    = orders.filter(o => o.status === "recibida").reduce((s, o) => s + o.total, 0);
  const pending       = orders.filter(o => o.status === "pendiente").length;
  const thisMonth     = orders.filter(o => {
    const d = o.createdAt?.toDate?.();
    const now = new Date();
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      {showForm && (
        <OrderFormModal inventory={inventory} editOrder={editOrder}
          preloadItems={preloadItems} suppliers={suppliers}
          onClose={() => { setShowForm(false); setEditOrder(null); setPreloadItems(null); }}
          onDone={load} />
      )}
      {detailOrder && (
        <OrderDetailModal order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onReceive={(o) => setReceiveOrder(o)}
          onDelete={handleDelete}
          onEdit={openEdit}
          canReceiveOrders={can("recepciones").canEdit} />
      )}
      {can("recepciones").canEdit && receiveOrder && (
        <ReceiveOrderModal order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onDone={load} />
      )}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Eliminar orden"
        description="¿Estás seguro de que deseas eliminar esta orden de compra? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <PageHeader
        title="Compras"
        subtitle="Gestiona tus órdenes de compra y reabastecimiento"
        action={
          <button onClick={() => { setEditOrder(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition">
            <Plus size={15} /> Nueva orden
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total órdenes",       value: fmt(orders.length, 0),  icon: FileText,    color: "text-indigo-600 bg-indigo-50" },
          { label: "Pendientes",          value: fmt(pending, 0),         icon: Clock,       color: "text-amber-600 bg-amber-50" },
          { label: "Este mes",            value: fmt(thisMonth, 0),       icon: ShoppingBag, color: "text-blue-600 bg-blue-50" },
          { label: "Total comprado",      value: fmtCurrency(totalSpent), icon: DollarSign,  color: "text-emerald-600 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={17} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N° orden, proveedor o RNC…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(["all","pendiente","parcial","recibida","cancelada"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${statusFilter === s ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                {s === "all" ? "Todas" : STATUS_META[s].label}
              </button>
            ))}
          </div>
          <span className="flex items-center text-xs text-slate-400 ml-auto">{filtered.length} órdenes</span>
        </div>

        {filtered.length === 0 ? (
          orders.length === 0
            ? <EmptyState icon={ShoppingBag} title="Sin órdenes de compra" description="Crea tu primera orden para llevar el control de lo que compras a tus proveedores." action={{ label: "Crear primera orden", onClick: () => setShowForm(true) }} />
            : <EmptyState icon={ShoppingBag} title="Sin resultados" description="Ninguna orden coincide con los filtros aplicados." />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block sm:hidden divide-y divide-slate-50">
              {pagedOrders.map((order) => (
                <div key={order.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setDetailOrder(order)}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-semibold text-brand-600">{order.orderNumber}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{order.supplierName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    <span>{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</span>
                    {order.expectedDate?.toDate?.() && (
                      <span>{order.expectedDate.toDate().toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {can("recepciones").canEdit && (order.status === "pendiente" || order.status === "parcial") && (
                        <button onClick={() => setReceiveOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition">
                          <PackageCheck size={15} />
                        </button>
                      )}
                      {order.status === "pendiente" && (
                        <>
                          <button onClick={() => openEdit(order)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg transition">
                            <Edit2 size={15} />
                          </button>
                          <AdminButton onClick={() => handleDelete(order.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition">
                            <Trash2 size={15} />
                          </AdminButton>
                        </>
                      )}
                      <button onClick={() => printOrder(order)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition">
                        <Printer size={15} />
                      </button>
                    </div>
                    <span className="text-base font-bold text-slate-900">{fmtCurrency(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                    {["N° Orden","Proveedor","RNC","Productos","Subtotal","ITBIS","Total","Fecha esperada","Estado",""].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setDetailOrder(order)}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-brand-600">{order.orderNumber}</td>
                      <td className="py-3 px-4 font-medium">{order.supplierName}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-xs">{order.supplierRnc || "—"}</td>
                      <td className="py-3 px-4 text-slate-600">{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</td>
                      <td className="py-3 px-4 text-slate-600">{fmtCurrency(order.subtotal)}</td>
                      <td className="py-3 px-4 text-slate-500">{fmtCurrency(order.tax)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{fmtCurrency(order.total)}</td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={order.status} /></td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {can("recepciones").canEdit && (order.status === "pendiente" || order.status === "parcial") && (
                            <button onClick={() => setReceiveOrder(order)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Recibir">
                              <PackageCheck size={14} />
                            </button>
                          )}
                          {order.status === "pendiente" && (
                            <>
                              <button onClick={() => openEdit(order)}
                                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="Editar">
                                <Edit2 size={14} />
                              </button>
                              <AdminButton onClick={() => handleDelete(order.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                                <Trash2 size={14} />
                              </AdminButton>
                            </>
                          )}
                          <button onClick={() => printOrder(order)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="Imprimir">
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={ordersPage}
              totalPages={ordersTotalPages}
              total={ordersTotal}
              pageSize={20}
              onPage={setOrdersPage}
            />
          </>
        )}
      </div>

      {/* Low stock alert */}
      {inventory.filter(i => i.currentStock <= i.minStock).length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {inventory.filter(i => i.currentStock <= i.minStock).length} productos necesitan reabastecimiento
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {inventory.filter(i => i.currentStock <= i.minStock).map(i => i.name).slice(0, 3).join(", ")}
              {inventory.filter(i => i.currentStock <= i.minStock).length > 3 ? "…" : ""}
            </p>
          </div>
          <button onClick={() => { setEditOrder(null); setShowForm(true); }}
            className="flex-shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition">
            Crear orden
          </button>
        </div>
      )}
    </div>
  );
}
