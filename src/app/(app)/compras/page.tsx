"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus, X, Search, Printer, Trash2, CheckCircle2,
  Clock, PackageCheck, XCircle, ChevronDown, ChevronUp,
  ShoppingBag, DollarSign, TruckIcon, AlertTriangle,
  Edit2, FileText, Package, Layers,
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
import { listRawMaterials } from "@/lib/firestore/rawMaterials";
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
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, PurchaseOrderType, InventoryItem, RawMaterial } from "@/types";

// ─── Order type helpers ────────────────────────────────────────────────────────

const TYPE_META: Record<PurchaseOrderType, { label: string; color: string; icon: React.ReactNode }> = {
  producto: { label: "Producto",  color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",              icon: <Package size={11} /> },
  insumo:   { label: "Insumo",    color: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",       icon: <Layers size={11} /> },
};

function orderType(o: PurchaseOrder): PurchaseOrderType {
  return o.orderType ?? "producto";
}

function TypeBadge({ order }: { order: PurchaseOrder }) {
  const m = TYPE_META[orderType(order)];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<PurchaseOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente:  { label: "Pendiente",  color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",   icon: <Clock size={12} /> },
  recibida:   { label: "Recibida",   color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", icon: <CheckCircle2 size={12} /> },
  parcial:    { label: "Parcial",    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",      icon: <PackageCheck size={12} /> },
  cancelada:  { label: "Cancelada",  color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",         icon: <XCircle size={12} /> },
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
  const isInsumo = orderType(order) === "insumo";
  const rows = order.items.map((i) =>
    `<tr>
      <td>${esc(i.sku)}</td><td>${esc(i.productName)}</td><td>${esc(i.category)}</td>
      <td style="text-align:center">${i.qtyOrdered}${i.unit ? ` ${esc(i.unit)}` : ""}</td>
      <td style="text-align:center">${i.qtyReceived}${i.unit ? ` ${esc(i.unit)}` : ""}</td>
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
          <h1>Orden de Compra${isInsumo ? " · Insumos" : ""}</h1>
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
        <thead><tr><th>${isInsumo ? "" : "SKU"}</th><th>${isInsumo ? "Insumo" : "Producto"}</th><th>${isInsumo ? "" : "Categoría"}</th><th>Cant. pedida</th><th>Cant. recibida</th><th>Costo unit.</th><th>Total</th></tr></thead>
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
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 rounded-t-3xl border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-400 font-mono">{order.orderNumber}</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{order.supplierName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <TypeBadge order={order} />
            <StatusBadge status={order.status} />
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"><X size={16} /></button>
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
              <div key={label} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3">
                <p className="text-xs text-slate-400 dark:text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Items */}
          <div>
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3 w-full text-left">
              <Package size={15} /> {orderType(order) === "insumo" ? "Insumos" : "Productos"} ({order.items.length})
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expanded && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400">
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
                      <tr key={i} className="border-t border-slate-50 dark:border-slate-700/50">
                        <td className="py-2.5 px-3 font-medium">{item.productName}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-400 dark:text-slate-400">{item.sku}</td>
                        <td className="py-2.5 px-3 text-center">{item.qtyOrdered}{item.unit ? ` ${item.unit}` : ""}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`font-semibold ${item.qtyReceived >= item.qtyOrdered ? "text-emerald-600 dark:text-emerald-400" : item.qtyReceived > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                            {item.qtyReceived}{item.unit ? ` ${item.unit}` : ""}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">{fmtCurrency(item.unitCost)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400"><span>Subtotal</span><span>{fmtCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400"><span>ITBIS (18%)</span><span>{fmtCurrency(order.tax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-slate-200 dark:border-slate-600 pt-2 mt-2"><span>Total</span><span className="text-brand-600">{fmtCurrency(order.total)}</span></div>
          </div>

          {order.note && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300">
              <b>Nota:</b> {order.note}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => printOrder(order)}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-300 transition">
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
                className="flex items-center gap-1.5 px-4 py-2.5 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10 transition ml-auto">
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

function OrderFormModal({ inventory, rawMaterials, editOrder, preloadItems, preloadType, suppliers, onClose, onDone }: {
  inventory: InventoryItem[];
  rawMaterials: RawMaterial[];
  editOrder: PurchaseOrder | null;
  preloadItems?: PurchaseOrder["items"] | null;
  preloadType?: PurchaseOrderType;
  suppliers: Supplier[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { workspaceId, isAdmin } = useRole();
  const [type, setType] = useState<PurchaseOrderType>(
    editOrder ? orderType(editOrder) : (preloadType ?? "producto")
  );
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
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: "", unit: "unidad", qty: "1", price: "" });

  const TAX_RATE = 0.18;
  const subtotal  = items.reduce((s, i) => s + i.total, 0);
  const tax       = subtotal * TAX_RATE;
  const total     = subtotal + tax;

  const filteredInv = inventory.filter((p) =>
    !items.find((i) => i.inventoryId === p.id) &&
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const filteredRaw = rawMaterials.filter((m) =>
    !items.find((i) => i.inventoryId === m.id) &&
    m.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function addProduct(p: InventoryItem) {
    setItems((prev) => [...prev, {
      inventoryId: p.id, sku: p.sku, productName: p.name,
      category: p.category, qtyOrdered: 1, qtyReceived: 0,
      unitCost: p.unitCost, total: p.unitCost, _inventoryId: p.id,
    }]);
    setProductSearch("");
  }

  function addMaterial(m: RawMaterial) {
    setItems((prev) => [...prev, {
      inventoryId: m.id, sku: "", productName: m.name,
      category: "", unit: m.unit, qtyOrdered: 1, qtyReceived: 0,
      unitCost: m.unitCost, total: m.unitCost, _inventoryId: m.id,
    }]);
    setProductSearch("");
  }

  // Insumo que Stefany quiere comprar pero todavía no existe en rawMaterials (ej. un color nuevo).
  // Se agrega a la orden con un id temporal; al recepcionar, purchases.ts crea el RawMaterial real.
  function addNewRawMaterialItem() {
    const name = newMaterial.name.trim();
    const qty = Number(newMaterial.qty);
    const price = Number(newMaterial.price);
    if (!name) { toast.error("Ponle un nombre al insumo nuevo"); return; }
    if (!qty || qty <= 0) { toast.error("La cantidad debe ser mayor a 0"); return; }
    if (Number.isNaN(price) || price < 0) { toast.error("El precio de compra no es válido"); return; }
    if (rawMaterials.some((m) => m.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error("Ya existe un insumo con ese nombre — búscalo arriba en vez de crearlo de nuevo");
      return;
    }
    const placeholderId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, {
      inventoryId: placeholderId, sku: "", productName: name,
      category: "", unit: newMaterial.unit.trim() || "unidad",
      qtyOrdered: qty, qtyReceived: 0,
      unitCost: price, total: qty * price,
      isNewRawMaterial: true, _inventoryId: placeholderId,
    }]);
    setNewMaterial({ name: "", unit: "unidad", qty: "1", price: "" });
    setShowNewMaterial(false);
  }

  // Cambiar de tipo con items ya cargados mezclaría inventario/insumos en la misma orden —
  // no tiene sentido de negocio, así que se limpia la lista al cambiar (solo posible al crear).
  function handleTypeChange(next: PurchaseOrderType) {
    if (next === type) return;
    setType(next);
    setItems([]);
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
    if (items.length === 0) { toast.error(type === "insumo" ? "Agrega al menos un insumo" : "Agrega al menos un producto"); return; }
    setFieldErrors({});

    setSaving(true);
    const payload = {
      ...fields,
      orderType: type,
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
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="font-bold text-slate-900 dark:text-slate-100">{editOrder ? "Editar orden" : "Nueva orden de compra"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Order type */}
          {isAdmin && !editOrder && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">¿Qué estás comprando?</label>
              <div className="flex gap-2">
                {([
                  { key: "producto" as const, label: "Producto terminado", sub: "reabastece Inventario", icon: Package },
                  { key: "insumo"   as const, label: "Insumo / materia prima", sub: "reabastece Insumos", icon: Layers },
                ]).map(({ key, label, sub, icon: Icon }) => (
                  <button key={key} type="button" onClick={() => handleTypeChange(key)}
                    className={`flex-1 flex items-start gap-2 p-3 rounded-xl border text-left transition ${type === key
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 dark:border-brand-500/50"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}>
                    <Icon size={16} className={type === key ? "text-brand-600 dark:text-brand-400 mt-0.5" : "text-slate-400 dark:text-slate-500 mt-0.5"} />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-400">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {editOrder && <TypeBadge order={editOrder} />}

          {/* Supplier */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3 flex items-center gap-2">
              <TruckIcon size={14} /> Datos del proveedor
            </h3>
            {suppliers.filter(s => s.active).length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Seleccionar de mis proveedores</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const s = suppliers.find(s => s.id === e.target.value);
                    if (s) setFields(p => ({ ...p, supplierId: s.id, supplierName: s.name, supplierRnc: s.rnc, supplierPhone: s.phone, supplierEmail: s.email }));
                  }}
                  className="w-full px-3 py-2 border border-brand-200 bg-brand-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-slate-100">
                  <option value="">— Elegir proveedor guardado —</option>
                  {suppliers.filter(s => s.active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.rnc ? ` · ${s.rnc}` : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Nombre del proveedor *", key: "supplierName" as const, placeholder: "ej. Distribuidora ABC" },
                { label: "RNC / ID fiscal",        key: "supplierRnc"  as const, placeholder: "ej. 1-31-12345-6" },
                { label: "Teléfono",               key: "supplierPhone" as const, placeholder: "ej. 809-555-0000" },
                { label: "Email",                  key: "supplierEmail" as const, placeholder: "compras@proveedor.com" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
                  <input value={fields[key]} onChange={setF(key)} placeholder={placeholder}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 ${fieldErrors[key] ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                  {fieldErrors[key] && <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{fieldErrors[key]}</p>}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Fecha esperada de entrega *</label>
                <input type="date" value={fields.expectedDate} onChange={setF("expectedDate")}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 ${fieldErrors.expectedDate ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                {fieldErrors.expectedDate && <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{fieldErrors.expectedDate}</p>}
              </div>
              {editOrder && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Estado</label>
                  <select value={fields.status} onChange={setF("status")}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100">
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
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3 flex items-center gap-2">
              {type === "insumo" ? <Layers size={14} /> : <Package size={14} />} {type === "insumo" ? "Insumos a comprar" : "Productos a comprar"}
            </h3>

            {/* Product / material search */}
            <div className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={type === "insumo" ? "Buscar insumo de materia prima…" : "Buscar producto del inventario…"}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
              </div>
              {productSearch && type === "producto" && (
                <div className="mt-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl overflow-hidden">
                  {filteredInv.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-400">Sin resultados</p>
                  ) : (
                    filteredInv.slice(0, 8).map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-500/10 text-sm flex items-center justify-between border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{p.name}
                          <span className="text-slate-400 dark:text-slate-400 font-mono text-xs ml-1.5">· {p.sku}</span>
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-xs ml-4 flex-shrink-0">{fmtCurrency(p.unitCost)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {productSearch && type === "insumo" && (
                <div className="mt-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl overflow-hidden">
                  {filteredRaw.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-400">Sin resultados</p>
                  ) : (
                    filteredRaw.slice(0, 8).map((m) => (
                      <button key={m.id} type="button" onClick={() => addMaterial(m)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-500/10 text-sm flex items-center justify-between border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{m.name}
                          <span className="text-slate-400 dark:text-slate-400 text-xs ml-1.5">· {m.unit}</span>
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-xs ml-4 flex-shrink-0">{fmtCurrency(m.unitCost)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Insumo libre — Stefany compra algo que aún no está registrado (ej. un color nuevo) */}
            {type === "insumo" && (
              <div className="mb-3">
                {!showNewMaterial ? (
                  <button type="button" onClick={() => setShowNewMaterial(true)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    <Plus size={12} /> ¿No está en la lista? Agregar insumo nuevo
                  </button>
                ) : (
                  <div className="p-3 border border-dashed border-brand-300 dark:border-brand-500/40 rounded-xl bg-brand-50/50 dark:bg-brand-500/10 space-y-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Insumo nuevo (aún no registrado en Insumos)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input value={newMaterial.name}
                        onChange={(e) => setNewMaterial((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre, ej. Limpiapipa negro"
                        className="sm:col-span-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
                      <input value={newMaterial.unit}
                        onChange={(e) => setNewMaterial((p) => ({ ...p, unit: e.target.value }))}
                        placeholder="Unidad (unidad, kg…)"
                        className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
                      <input type="number" min={1} value={newMaterial.qty}
                        onChange={(e) => setNewMaterial((p) => ({ ...p, qty: e.target.value }))}
                        placeholder="Cantidad"
                        className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
                    </div>
                    <div className="flex gap-2">
                      <input type="number" min={0} step="0.01" value={newMaterial.price}
                        onChange={(e) => setNewMaterial((p) => ({ ...p, price: e.target.value }))}
                        placeholder="Precio de compra (unitario)"
                        className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
                      <button type="button" onClick={addNewRawMaterialItem}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition">
                        Agregar
                      </button>
                      <button type="button" onClick={() => { setShowNewMaterial(false); setNewMaterial({ name: "", unit: "unidad", qty: "1", price: "" }); }}
                        className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-300 transition">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center text-slate-400 dark:text-slate-400 text-sm">
                {type === "insumo" ? "Busca y selecciona insumos registrados" : "Busca y selecciona productos del inventario"}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400">
                      <th className="text-left py-2.5 px-3 font-medium">{type === "insumo" ? "Insumo" : "Producto"}</th>
                      <th className="text-center py-2.5 px-3 font-medium">Cantidad</th>
                      <th className="text-right py-2.5 px-3 font-medium">Costo unit.</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total</th>
                      <th className="py-2.5 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-50 dark:border-slate-700/50">
                        <td className="py-2.5 px-3">
                          <p className="font-medium flex items-center gap-1.5">
                            {item.productName}
                            {item.isNewRawMaterial && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                                Nuevo
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <input type="number" min={1} value={item.qtyOrdered}
                              onChange={(e) => updateItem(idx, "qtyOrdered", Number(e.target.value))}
                              className="w-20 text-center border border-slate-200 dark:border-slate-700 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 block bg-white dark:bg-slate-800 dark:text-slate-100" />
                            {item.unit && <span className="text-xs text-slate-400 dark:text-slate-400">{item.unit}</span>}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <input type="number" min={0} step="0.01" value={item.unitCost}
                            onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                            className="w-24 text-right border border-slate-200 dark:border-slate-700 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ml-auto block bg-white dark:bg-slate-800 dark:text-slate-100" />
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmtCurrency(item.total)}</td>
                        <td className="py-2.5 px-3">
                          <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                            className="p-1 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition text-slate-400 dark:text-slate-500">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 border-t border-slate-100 dark:border-slate-700 space-y-1">
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>ITBIS 18%</span><span>{fmtCurrency(tax)}</span></div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100"><span>Total</span><span className="text-brand-600">{fmtCurrency(total)}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nota interna <span className="text-slate-400 dark:text-slate-400 font-normal">(opcional)</span></label>
            <textarea value={fields.note} onChange={setF("note")} rows={2}
              placeholder="Instrucciones de entrega, condiciones especiales…"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
              {saving ? "Guardando…" : editOrder ? "Guardar cambios" : "Crear orden de compra"}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-300 transition">
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
  const { workspaceId, can, isAdmin } = useRole();
  const [orders,    setOrders]    = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<PurchaseOrderType | "all">("all");

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
      // Insumos es admin-only (mismas reglas de Firestore que el módulo Insumos) —
      // no pedir esa colección si el rol no puede leerla, tiraría permission-denied.
      const [o, i, m] = await Promise.all([
        listPurchaseOrders(workspaceId),
        listInventory(workspaceId),
        isAdmin ? listRawMaterials(workspaceId) : Promise.resolve([]),
      ]);
      setOrders(o); setInventory(i); setRawMaterials(m);
    } catch { toast.error("Error al cargar datos"); }
    finally { setLoading(false); }
  }, [user, isAdmin]);

  // Open form pre-filled when coming from inventario/reabastecer o insumos/reabastecer
  const [preloadItems, setPreloadItems] = useState<PurchaseOrder["items"] | null>(null);
  const [preloadType,  setPreloadType]  = useState<PurchaseOrderType | undefined>(undefined);
  useEffect(() => {
    const rawProducto = localStorage.getItem("compras_preload");
    const rawInsumo    = localStorage.getItem("compras_preload_insumo");
    if (rawProducto) {
      try { setPreloadItems(JSON.parse(rawProducto)); setPreloadType("producto"); setShowForm(true); } catch { /* ignore */ }
      localStorage.removeItem("compras_preload");
    } else if (rawInsumo) {
      try { setPreloadItems(JSON.parse(rawInsumo)); setPreloadType("insumo"); setShowForm(true); } catch { /* ignore */ }
      localStorage.removeItem("compras_preload_insumo");
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
    const matchType = typeFilter === "all" || orderType(o) === typeFilter;
    return matchSearch && matchStatus && matchType;
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
        <OrderFormModal inventory={inventory} rawMaterials={rawMaterials} editOrder={editOrder}
          preloadItems={preloadItems} preloadType={preloadType} suppliers={suppliers}
          onClose={() => { setShowForm(false); setEditOrder(null); setPreloadItems(null); setPreloadType(undefined); }}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total órdenes",       value: fmt(orders.length, 0),  icon: FileText,    color: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15" },
          { label: "Pendientes",          value: fmt(pending, 0),         icon: Clock,       color: "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15" },
          { label: "Este mes",            value: fmt(thisMonth, 0),       icon: ShoppingBag, color: "text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/15" },
          { label: "Total comprado",      value: fmtCurrency(totalSpent), icon: DollarSign,  color: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wide">{label}</p>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={17} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-3 p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N° orden, proveedor o RNC…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
          </div>
          {isAdmin && (
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              {(["all","producto","insumo"] as const).map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${typeFilter === t ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                  {t === "all" ? "Todo" : TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {(["all","pendiente","parcial","recibida","cancelada"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${statusFilter === s ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                {s === "all" ? "Todas" : STATUS_META[s].label}
              </button>
            ))}
          </div>
          <span className="flex items-center text-xs text-slate-400 dark:text-slate-400 ml-auto">{filtered.length} órdenes</span>
        </div>

        {filtered.length === 0 ? (
          orders.length === 0
            ? <EmptyState icon={ShoppingBag} title="Sin órdenes de compra" description="Crea tu primera orden para llevar el control de lo que compras a tus proveedores." action={{ label: "Crear primera orden", onClick: () => setShowForm(true) }} />
            : <EmptyState icon={ShoppingBag} title="Sin resultados" description="Ninguna orden coincide con los filtros aplicados." />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block sm:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
              {pagedOrders.map((order) => (
                <div key={order.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                  onClick={() => setDetailOrder(order)}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-semibold text-brand-600">{order.orderNumber}</span>
                    <div className="flex items-center gap-1.5">
                      {orderType(order) === "insumo" && <TypeBadge order={order} />}
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{order.supplierName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-400 flex-wrap">
                    <span>{order.items.length} {orderType(order) === "insumo" ? "insumo" : "producto"}{order.items.length !== 1 ? "s" : ""}</span>
                    {order.expectedDate?.toDate?.() && (
                      <span>{order.expectedDate.toDate().toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {can("recepciones").canEdit && (order.status === "pendiente" || order.status === "parcial") && (
                        <button onClick={() => setReceiveOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400 rounded-lg transition">
                          <PackageCheck size={15} />
                        </button>
                      )}
                      {order.status === "pendiente" && (
                        <>
                          <button onClick={() => openEdit(order)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400 rounded-lg transition">
                            <Edit2 size={15} />
                          </button>
                          <AdminButton onClick={() => handleDelete(order.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 rounded-lg transition">
                            <Trash2 size={15} />
                          </AdminButton>
                        </>
                      )}
                      <button onClick={() => printOrder(order)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 rounded-lg transition">
                        <Printer size={15} />
                      </button>
                    </div>
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100">{fmtCurrency(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100 dark:text-slate-400 dark:bg-slate-700/40 dark:border-slate-700">
                    {["N° Orden", ...(isAdmin ? ["Tipo"] : []), "Proveedor","RNC","Productos","Subtotal","ITBIS","Total","Fecha esperada","Estado",""].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-50 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => setDetailOrder(order)}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-brand-600">{order.orderNumber}</td>
                      {isAdmin && <td className="py-3 px-4"><TypeBadge order={order} /></td>}
                      <td className="py-3 px-4 font-medium">{order.supplierName}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-xs dark:text-slate-400">{order.supplierRnc || "—"}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{order.items.length} {orderType(order) === "insumo" ? "insumo" : "producto"}{order.items.length !== 1 ? "s" : ""}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{fmtCurrency(order.subtotal)}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{fmtCurrency(order.tax)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(order.total)}</td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap dark:text-slate-400">
                        {order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={order.status} /></td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {can("recepciones").canEdit && (order.status === "pendiente" || order.status === "parcial") && (
                            <button onClick={() => setReceiveOrder(order)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 rounded-lg transition" title="Recibir">
                              <PackageCheck size={14} />
                            </button>
                          )}
                          {order.status === "pendiente" && (
                            <>
                              <button onClick={() => openEdit(order)}
                                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:text-slate-500 dark:hover:text-brand-400 dark:hover:bg-brand-500/10 rounded-lg transition" title="Editar">
                                <Edit2 size={14} />
                              </button>
                              <AdminButton onClick={() => handleDelete(order.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition" title="Eliminar">
                                <Trash2 size={14} />
                              </AdminButton>
                            </>
                          )}
                          <button onClick={() => printOrder(order)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 rounded-lg transition" title="Imprimir">
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
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 dark:bg-amber-500/15 dark:border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {inventory.filter(i => i.currentStock <= i.minStock).length} productos necesitan reabastecimiento
            </p>
            <p className="text-xs text-amber-600 mt-0.5 dark:text-amber-400">
              {inventory.filter(i => i.currentStock <= i.minStock).map(i => i.name).slice(0, 3).join(", ")}
              {inventory.filter(i => i.currentStock <= i.minStock).length > 3 ? "…" : ""}
            </p>
          </div>
          <button onClick={() => { setEditOrder(null); setPreloadType("producto"); setShowForm(true); }}
            className="flex-shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition">
            Crear orden
          </button>
        </div>
      )}

      {/* Low stock alert — insumos (solo Admin, mismo criterio que el módulo Insumos) */}
      {isAdmin && rawMaterials.filter(m => m.currentStock <= m.minStock).length > 0 && (
        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3 dark:bg-purple-500/15 dark:border-purple-500/30">
          <AlertTriangle size={18} className="text-purple-600 flex-shrink-0 mt-0.5 dark:text-purple-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">
              {rawMaterials.filter(m => m.currentStock <= m.minStock).length} insumos necesitan reabastecimiento
            </p>
            <p className="text-xs text-purple-600 mt-0.5 dark:text-purple-400">
              {rawMaterials.filter(m => m.currentStock <= m.minStock).map(m => m.name).slice(0, 3).join(", ")}
              {rawMaterials.filter(m => m.currentStock <= m.minStock).length > 3 ? "…" : ""}
            </p>
          </div>
          <button onClick={() => { setEditOrder(null); setPreloadType("insumo"); setShowForm(true); }}
            className="flex-shrink-0 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition">
            Crear orden
          </button>
        </div>
      )}
    </div>
  );
}
