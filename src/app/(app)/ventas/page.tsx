"use client";

import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  ShoppingCart, Download, Search, Plus, Minus, Trash2, X,
  TrendingUp, Users, Package, DollarSign, CreditCard,
  CheckCircle2, Clock, BarChart2, Award, Receipt, LayoutGrid, ImageOff,
  Lock, Banknote, Building2, Smartphone, AlertTriangle,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import Papa from "papaparse";
import { useAuth } from "@/contexts/AuthContext";
import { useCaja } from "@/contexts/CajaContext";
import { closeCajaSession } from "@/lib/firestore/caja";
import { useInventory, useInvalidateInventory } from "@/hooks/useInventory";
import { useSales, useInvalidateSales } from "@/hooks/useSales";
import { useCustomers } from "@/hooks/useCustomers";
import {
  registerSaleOrder, computeSummary, computeDailyStats,
  computeByProduct, computeByClient,
} from "@/lib/firestore/sales";
import { fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { InvoiceModal, type InvoiceData } from "@/components/ui/InvoiceModal";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { getCompany } from "@/lib/firestore/companies";
import { saleSchema, zodErrors } from "@/lib/schemas";
import type { InventoryItem, Sale, Period, PaymentStatus } from "@/types";

type Tab = "register" | "analytics" | "history" | "cierre";

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pagado:    { label: "Pagado",    color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={11} /> },
  pendiente: { label: "Pendiente", color: "bg-amber-50 text-amber-700 border-amber-200",       icon: <Clock size={11} /> },
  credito:   { label: "Crédito",   color: "bg-blue-50 text-blue-700 border-blue-200",           icon: <CreditCard size={11} /> },
};

const CHART_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899"];

interface CartItem {
  inventoryId: string;
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

// ── Product Picker Modal ───────────────────────────────────────────────────────

function ProductPickerModal({ items, cart, onConfirm, onClose }: {
  items: InventoryItem[];
  cart: CartItem[];
  onConfirm: (selected: InventoryItem[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch]   = useState("");
  const [picked, setPicked]   = useState<Set<string>>(
    () => new Set(cart.map((c) => c.inventoryId))
  );
  const [catFilter, setCatFilter] = useState("Todas");

  const categories = ["Todas", ...Array.from(new Set(items.map((i) => i.category))).sort()];

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q);
    const matchCat = catFilter === "Todas" || i.category === catFilter;
    return matchSearch && matchCat;
  });

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirm() {
    onConfirm(items.filter((i) => picked.has(i.id)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Catálogo de productos</h2>
            <p className="text-xs text-slate-400 mt-0.5">{picked.size} seleccionado{picked.size !== 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-slate-50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o categoría…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCatFilter(c)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition
                  ${catFilter === c ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map((item) => {
                const isSelected = picked.has(item.id);
                const noStock    = item.currentStock === 0;
                return (
                  <button
                    key={item.id} type="button"
                    disabled={noStock}
                    onClick={() => !noStock && toggle(item.id)}
                    className={`relative flex flex-col rounded-2xl border-2 text-left transition overflow-hidden
                      ${noStock ? "opacity-40 cursor-not-allowed border-slate-100" :
                        isSelected ? "border-brand-500 shadow-md shadow-brand-100" : "border-slate-100 hover:border-brand-300 hover:shadow-sm"}`}
                  >
                    {/* Checkbox badge */}
                    <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition
                      ${isSelected ? "bg-brand-600 border-brand-600" : "bg-white border-slate-300"}`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Image */}
                    <div className="w-full aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff size={28} className="text-slate-200" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-1">
                      <p className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2">{item.name}
                        {item.color ? <span className="text-slate-400 font-normal"> · {item.color}</span> : ""}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold text-brand-700">{fmtCurrency(item.salePrice)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium
                          ${item.currentStock === 0 ? "bg-red-50 text-red-600" :
                            item.currentStock <= item.minStock ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {item.currentStock} uds
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{item.category}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <p className="text-sm text-slate-500">
            {picked.size > 0
              ? `${picked.size} producto${picked.size !== 1 ? "s" : ""} seleccionado${picked.size !== 1 ? "s" : ""}`
              : "Selecciona productos para agregar al carrito"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition">
              Cancelar
            </button>
            <button type="button" onClick={confirm} disabled={picked.size === 0}
              className="px-5 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              Agregar {picked.size > 0 ? `(${picked.size})` : ""} al carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Product search with live dropdown ─────────────────────────────────────────

function ProductSearch({ items, cart, onAdd, onOpenPicker }: {
  items: InventoryItem[];
  cart: CartItem[];
  onAdd: (item: InventoryItem) => void;
  onOpenPicker: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = search.trim().length >= 1
    ? items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="relative flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nombre, SKU o categoría…"
            className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); setOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
              <X size={14} />
            </button>
          )}

          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
              {results.map((item) => {
                const inCart  = cart.find((c) => c.inventoryId === item.id);
                const noStock = item.currentStock === 0;
                return (
                  <button key={item.id} type="button" disabled={noStock}
                    onClick={() => { onAdd(item); setSearch(""); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 transition border-b border-slate-50 last:border-0
                      ${noStock ? "opacity-40 cursor-not-allowed" : ""}`}>
                    {/* Thumbnail */}
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        : <ImageOff size={14} className="text-slate-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.name}{item.color ? <span className="text-slate-400 font-normal"> · {item.color}</span> : ""}
                      </p>
                      <p className="text-xs text-slate-400">{item.sku} · {item.category}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-brand-700">{fmtCurrency(item.salePrice)}</p>
                      <p className={`text-xs ${item.currentStock <= item.minStock ? "text-red-500" : "text-slate-400"}`}>
                        {item.currentStock} en stock
                      </p>
                    </div>
                    {inCart && (
                      <span className="w-5 h-5 bg-brand-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {open && search.trim().length >= 1 && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-center text-sm text-slate-400">
              No se encontraron productos
            </div>
          )}
        </div>

        {/* Catalog button */}
        <button type="button" onClick={onOpenPicker}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-xl text-sm font-medium hover:bg-brand-100 transition flex-shrink-0">
          <LayoutGrid size={15} />
          <span className="hidden sm:inline">Catálogo</span>
        </button>
      </div>
      <p className="text-xs text-slate-400">Escribe para buscar · o abre el catálogo para ver todos los productos</p>
    </div>
  );
}

// ── Cart item row ─────────────────────────────────────────────────────────────

function CartRow({ item, onChange, onRemove }: {
  item: CartItem;
  onChange: (patch: Partial<CartItem>) => void;
  onRemove: () => void;
}) {
  const subtotal = item.quantity * item.unitPrice;

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
        <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
      </div>

      {/* Unit price */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">$</span>
        <input type="number" min={0} step="0.01" value={item.unitPrice}
          onChange={(e) => onChange({ unitPrice: Number(e.target.value) })}
          className="w-20 text-right text-sm font-semibold border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-1">
        <button type="button"
          onClick={() => item.quantity > 1 ? onChange({ quantity: item.quantity - 1 }) : onRemove()}
          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition text-slate-400">
          <Minus size={12} />
        </button>
        <input type="number" min={1} max={item.maxStock} value={item.quantity}
          onChange={(e) => onChange({ quantity: Math.min(item.maxStock, Math.max(1, Number(e.target.value))) })}
          className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button type="button"
          onClick={() => onChange({ quantity: Math.min(item.maxStock, item.quantity + 1) })}
          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition text-slate-400">
          <Plus size={12} />
        </button>
      </div>

      {/* Subtotal */}
      <div className="text-right w-24 flex-shrink-0">
        <p className="text-sm font-bold text-slate-900">{fmtCurrency(subtotal)}</p>
        <p className="text-xs text-slate-400">{item.quantity} × {fmtCurrency(item.unitPrice)}</p>
      </div>

      <button type="button" onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ sales }: { sales: Sale[] }) {
  const summary  = computeSummary(sales);
  const daily    = computeDailyStats(sales);
  const byProd   = computeByProduct(sales).slice(0, 7);
  const byClient = computeByClient(sales).filter((c) => c.client !== "Sin cliente").slice(0, 5);
  const margin   = summary.revenue > 0 ? (summary.profit / summary.revenue * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Ingresos totales",  value: fmtCurrency(summary.revenue), sub: `${summary.numSales} ventas`,               icon: DollarSign, color: "indigo" },
          { label: "Ganancia total",    value: fmtCurrency(summary.profit),  sub: `Margen ${fmt(margin, 1)}%`,                icon: TrendingUp, color: "emerald" },
          { label: "Unidades vendidas", value: fmt(summary.totalUnits, 0),   sub: `Costo ${fmtCurrency(summary.cost)}`,       icon: Package,    color: "amber" },
          { label: "Ticket promedio",   value: summary.numSales > 0 ? fmtCurrency(summary.revenue / summary.numSales) : "$0",
            sub: "por transacción", icon: Receipt, color: "blue" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-${color}-50 text-${color}-600`}>
                <Icon size={15} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        {byProd.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Award size={16} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-700">Top productos por ganancia</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byProd} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <YAxis type="category" dataKey="productName" tick={{ fontSize: 11 }} width={90} axisLine={false} tickLine={false}
                  tickFormatter={(v: string) => v.length > 13 ? v.slice(0, 13) + "…" : v} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "none", fontSize: 12 }}
                  formatter={(v: number) => [fmtCurrency(v), "Ganancia"]} />
                <Bar dataKey="profit" radius={[0, 6, 6, 0]}>
                  {byProd.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top clients */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-700">Top clientes por ingresos</h3>
          </div>
          {byClient.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-300">
              <Users size={32} className="mb-2" />
              <p className="text-sm">Sin datos de clientes aún</p>
              <p className="text-xs mt-1">Completa el campo Cliente al registrar ventas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {byClient.map((c, i) => {
                const maxRev = byClient[0].revenue;
                const pct    = maxRev > 0 ? (c.revenue / maxRev) * 100 : 0;
                return (
                  <div key={c.client}>
                    <div className="flex items-center justify-between mb-1 text-sm">
                      <span className="font-medium text-slate-800 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                          {i + 1}
                        </span>
                        {c.client}
                      </span>
                      <span className="font-semibold text-slate-900">{fmtCurrency(c.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.numSales} venta{c.numSales !== 1 ? "s" : ""} · {c.totalUnits} u · ganancia {fmtCurrency(c.profit)} · {c.marginPct}% margen
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daily trend */}
      {daily.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">Tendencia diaria</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
              <Tooltip formatter={(v: number) => [fmtCurrency(v), ""]} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Ingresos" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit"  name="Ganancia" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Cierre del día tab ────────────────────────────────────────────────────────

function CierreTab({ sales, uid }: { sales: Sale[]; uid: string }) {
  const { session, reload } = useCaja();
  const today = new Date().toISOString().slice(0, 10);

  const todaySales = sales.filter((s) => {
    const d = s.saleDate.toDate().toISOString().slice(0, 10);
    return d === today;
  });

  const totalSales    = todaySales.reduce((s, v) => s + v.totalRevenue, 0);
  const totalItems    = todaySales.reduce((s, v) => s + v.quantity, 0);
  const pagadas       = todaySales.filter((s) => (s.paymentStatus ?? "pagado") === "pagado");
  const pendientes    = todaySales.filter((s) => (s.paymentStatus ?? "pagado") === "pendiente");
  const credito       = todaySales.filter((s) => (s.paymentStatus ?? "pagado") === "credito");
  const totalPagado   = pagadas.reduce((s, v) => s + v.totalRevenue, 0);
  const totalPendiente = pendientes.reduce((s, v) => s + v.totalRevenue, 0);
  const totalCredito  = credito.reduce((s, v) => s + v.totalRevenue, 0);

  const [efectivo,     setEfectivo]     = useState<number | "">("");
  const [tarjeta,      setTarjeta]      = useState<number | "">("");
  const [transferencia,setTransferencia]= useState<number | "">("");
  const [notas,        setNotas]        = useState("");
  const [saving,       setSaving]       = useState(false);

  const totalDeclarado =
    (typeof efectivo === "number" ? efectivo : 0) +
    (typeof tarjeta  === "number" ? tarjeta  : 0) +
    (typeof transferencia === "number" ? transferencia : 0);
  const diferencia = totalDeclarado - totalPagado;

  async function handleCierre() {
    if (!session) return;
    setSaving(true);
    try {
      await closeCajaSession(uid, session.id, {
        totalSales:    totalSales,
        totalItems,
        cashSales:     typeof efectivo      === "number" ? efectivo      : 0,
        cardSales:     typeof tarjeta       === "number" ? tarjeta       : 0,
        transferSales: typeof transferencia === "number" ? transferencia : 0,
        creditSales:   totalCredito,
        actualCash:    typeof efectivo      === "number" ? efectivo      : 0,
        closingNotes:  notas,
      });
      await reload();
      toast.success("Cierre de caja realizado correctamente");
    } catch {
      toast.error("Error al realizar el cierre");
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-14 text-center shadow-sm">
        <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-400" />
        <p className="text-slate-700 font-semibold">Caja ya cerrada</p>
        <p className="text-slate-400 text-sm mt-1">El cierre de hoy ya fue registrado</p>
      </div>
    );
  }

  const openTime = session.openedAt.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      {/* Session info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">Caja abierta desde las {openTime}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Fondo inicial: {fmtCurrency(session.initialCash)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-emerald-700">EN OPERACIÓN</span>
        </div>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Ventas del día",   value: todaySales.length,         sub: `${totalItems} unidades`, color: "indigo" },
          { label: "Total facturado",  value: fmtCurrency(totalSales),   sub: "Monto bruto",            color: "emerald" },
          { label: "Cobrado (pagado)", value: fmtCurrency(totalPagado),  sub: `${pagadas.length} trans.`,color: "blue" },
          { label: "Pendiente/crédito",value: fmtCurrency(totalPendiente + totalCredito),
            sub: `${pendientes.length + credito.length} trans.`, color: "amber" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className={`bg-white rounded-2xl border border-slate-100 p-4 shadow-sm`}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold text-${color}-600`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Cuadre de caja */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Banknote size={16} className="text-emerald-500" /> Cuadre de caja — desglose cobrado
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {[
            { label: "Efectivo recibido",    icon: Banknote,   val: efectivo,     set: setEfectivo     },
            { label: "Tarjeta / POS",        icon: CreditCard, val: tarjeta,      set: setTarjeta      },
            { label: "Transferencia / SINPE",icon: Building2,  val: transferencia,set: setTransferencia},
          ].map(({ label, icon: Icon, val, set }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Icon size={13} className="text-slate-400" /> {label}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number" min={0} step="0.01"
                  value={val}
                  onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Comparison */}
        <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total facturado pagado</span>
            <span className="font-semibold text-slate-800">{fmtCurrency(totalPagado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total declarado</span>
            <span className="font-semibold text-slate-800">{fmtCurrency(totalDeclarado)}</span>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex justify-between">
            <span className={`font-bold ${diferencia === 0 ? "text-emerald-600" : diferencia > 0 ? "text-blue-600" : "text-red-600"}`}>
              {diferencia === 0 ? "✓ Caja cuadrada" : diferencia > 0 ? `Sobrante` : `Faltante`}
            </span>
            <span className={`font-bold text-lg ${diferencia === 0 ? "text-emerald-600" : diferencia > 0 ? "text-blue-600" : "text-red-600"}`}>
              {diferencia === 0 ? "—" : `${diferencia > 0 ? "+" : ""}${fmtCurrency(Math.abs(diferencia))}`}
            </span>
          </div>
        </div>

        {/* Credits pending */}
        {(totalPendiente + totalCredito) > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs text-amber-700">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Hay {fmtCurrency(totalPendiente + totalCredito)} en ventas pendientes/crédito que <strong>no se incluyen</strong> en el cuadre de caja.
            </span>
          </div>
        )}

        {/* Notes */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones del cierre</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Ej: Sin novedad · Hubo descuadre por billete falso…"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button
          onClick={handleCierre}
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Cerrando caja…</>
            : <><Lock size={16} /> Realizar cierre y cerrar caja</>}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VentasPage() {
  const { user, profile } = useAuth();
  const { session, cajaOpen } = useCaja();
  const [tab,        setTab]       = useState<Tab>("register");
  const [period,     setPeriod]    = useState<Period>(30);
  const [saving,     setSaving]    = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { items, loading: itemsLoading } = useInventory();
  const { sales, loading: salesLoading, refetch: refetchSales } = useSales(period);
  const { customers } = useCustomers();
  const invalidateInventory = useInvalidateInventory();
  const invalidateSales     = useInvalidateSales();
  const loading = itemsLoading || salesLoading;

  // Cart state
  const [showPicker,    setShowPicker]    = useState(false);
  const [cart,          setCart]          = useState<CartItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pagado");
  const [dueDate,       setDueDate]       = useState("");
  const [route,         setRoute]         = useState("");
  const [zone,          setZone]          = useState("");
  const [client,        setClient]        = useState("");
  const [clientRnc,     setClientRnc]     = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPhone,   setClientPhone]   = useState("");
  const [clientEmail,   setClientEmail]   = useState("");
  const [notes,         setNotes]         = useState("");
  const [ncf,           setNcf]           = useState("");
  const [saleDate,      setSaleDate]      = useState(format(new Date(), "yyyy-MM-dd"));

  // Invoice modal
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);

  // History filters
  const [histPayFilter,  setHistPayFilter]  = useState<PaymentStatus | "all">("all");
  const [histSearch,     setHistSearch]     = useState("");


  function addToCart(item: InventoryItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.inventoryId === item.id);
      if (existing) {
        return prev.map((c) => c.inventoryId === item.id
          ? { ...c, quantity: Math.min(c.maxStock, c.quantity + 1) }
          : c);
      }
      return [...prev, {
        inventoryId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unitCost: item.unitCost,
        unitPrice: item.salePrice,
        quantity: 1,
        maxStock: item.currentStock,
      }];
    });
  }

  function handlePickerConfirm(selected: InventoryItem[]) {
    selected.forEach((item) => addToCart(item));
    setShowPicker(false);
  }

  function updateCartItem(inventoryId: string, patch: Partial<CartItem>) {
    setCart((prev) => prev.map((c) => c.inventoryId === inventoryId ? { ...c, ...patch } : c));
  }

  function removeFromCart(inventoryId: string) {
    setCart((prev) => prev.filter((c) => c.inventoryId !== inventoryId));
  }

  const cartTotal  = cart.reduce((s, c) => s + c.quantity * c.unitPrice, 0);
  const cartCost   = cart.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const cartProfit = cartTotal - cartCost;
  const cartMargin = cartTotal > 0 ? (cartProfit / cartTotal * 100) : 0;
  const cartUnits  = cart.reduce((s, c) => s + c.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (cart.length === 0) { toast.error("Agrega al menos un producto al carrito"); return; }

    const validation = saleSchema.pick({ route: true, client: true, zone: true }).safeParse({ route, client, zone });
    if (!validation.success) {
      setFormErrors(zodErrors(validation));
      return;
    }
    setFormErrors({});
    setSaving(true);
    const cartSnapshot = [...cart];
    const formSnapshot = { route, zone, client, clientRnc, clientAddress, clientPhone, clientEmail, notes, ncf, saleDate, paymentStatus, dueDate };
    const r = await registerSaleOrder(user.uid, {
      items: cart.map((c) => ({ inventoryId: c.inventoryId, quantity: c.quantity, unitPrice: c.unitPrice })),
      route, zone, client, clientRnc, clientAddress, clientPhone, clientEmail, notes, ncf,
      saleDate: new Date(saleDate),
      paymentStatus,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      // Build invoice data before clearing cart
      let companyName, companyRif, companyPhone, companyEmail, companyAddress;
      try {
        if (profile?.companyId) {
          const co = await getCompany(profile.companyId);
          if (co) {
            companyName    = co.name;
            companyRif     = co.rif;
            companyPhone   = co.phone;
            companyEmail   = co.email;
            companyAddress = co.address;
          }
        }
      } catch { /* use defaults */ }
      setInvoice({
        invoiceNumber:  r.invoiceNumber ?? `FAC-${Date.now()}`,
        ncf:            r.ncf,
        date:           new Date(formSnapshot.saleDate),
        client:         formSnapshot.client,
        clientRnc:      formSnapshot.clientRnc,
        clientAddress:  formSnapshot.clientAddress,
        clientPhone:    formSnapshot.clientPhone,
        clientEmail:    formSnapshot.clientEmail,
        notes:          formSnapshot.notes,
        route:          formSnapshot.route,
        zone:           formSnapshot.zone,
        paymentStatus:  formSnapshot.paymentStatus,
        dueDate:        formSnapshot.dueDate ? new Date(formSnapshot.dueDate) : undefined,
        items: cartSnapshot.map((c) => ({
          name: c.name, sku: c.sku, category: c.category,
          quantity: c.quantity, unitPrice: c.unitPrice, unitCost: c.unitCost,
        })),
        companyName, companyRif, companyPhone, companyEmail, companyAddress,
      });
      setCart([]);
      setRoute(""); setZone(""); setClient("");
      setClientRnc(""); setClientAddress(""); setClientPhone(""); setClientEmail("");
      setNotes(""); setNcf("");
      setPaymentStatus("pagado"); setDueDate("");
      invalidateInventory();
      invalidateSales();
    } else {
      toast.error(r.message);
    }
  }

  async function openSaleInvoice(sale: Sale) {
    // Group all items of the same order (shared saleOrderId)
    const orderItems = sale.saleOrderId
      ? sales.filter((s) => s.saleOrderId === sale.saleOrderId)
      : [sale];

    // Generate invoice number from sale date + id
    const d   = sale.saleDate.toDate();
    const yy  = String(d.getFullYear()).slice(2);
    const mm  = String(d.getMonth() + 1).padStart(2, "0");
    const dd  = String(d.getDate()).padStart(2, "0");
    const ref = (sale.saleOrderId ?? sale.id).slice(-4).toUpperCase();
    const invoiceNumber = `FAC-${yy}${mm}${dd}-${ref}`;

    let companyName, companyRif, companyPhone, companyEmail, companyAddress;
    try {
      if (profile?.companyId) {
        const co = await getCompany(profile.companyId);
        if (co) {
          companyName = co.name; companyRif = co.rif;
          companyPhone = co.phone; companyEmail = co.email;
          companyAddress = co.address;
        }
      }
    } catch { /* use defaults */ }

    setInvoice({
      invoiceNumber:  sale.invoiceNumber ?? invoiceNumber,
      ncf:            sale.ncf,
      date:           d,
      client:         sale.client,
      clientRnc:      sale.clientRnc,
      clientAddress:  sale.clientAddress,
      clientPhone:    sale.clientPhone,
      clientEmail:    sale.clientEmail,
      notes:          sale.notes,
      route:          sale.route,
      zone:           sale.zone,
      paymentStatus:  sale.paymentStatus ?? "pagado",
      dueDate:        sale.dueDate?.toDate(),
      items: orderItems.map((s) => ({
        name: s.productName, sku: s.sku, category: s.category,
        quantity: s.quantity, unitPrice: s.unitPrice, unitCost: s.unitCost,
      })),
      companyName, companyRif, companyPhone, companyEmail, companyAddress,
    });
  }

  function exportCSV() {
    const csv = Papa.unparse(sales.map((s) => ({
      fecha:         fmtDate(s.saleDate),
      producto:      s.productName,
      sku:           s.sku,
      cantidad:      s.quantity,
      precio_unit:   s.unitPrice,
      ruta:          s.route,
      zona:          s.zone,
      cliente:       s.client,
      estado_pago:   s.paymentStatus ?? "pagado",
      ingreso:       s.totalRevenue,
      costo:         s.totalCost,
      ganancia:      s.profit,
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `ventas_${period}d.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filteredSales = sales.filter((s) => {
    const matchPay = histPayFilter === "all" || (s.paymentStatus ?? "pagado") === histPayFilter;
    const q = histSearch.toLowerCase();
    const matchSearch = !q ||
      s.productName.toLowerCase().includes(q) ||
      (s.client ?? "").toLowerCase().includes(q) ||
      (s.route ?? "").toLowerCase().includes(q) ||
      (s.sku ?? "").toLowerCase().includes(q);
    return matchPay && matchSearch;
  });

  const histPagination = usePagination(filteredSales, 20);

  if (loading) return <FullPageSpinner />;

  const TABS: { key: Tab; label: string }[] = [
    { key: "register",  label: "🛒 Nueva venta" },
    { key: "analytics", label: "📊 Análisis" },
    { key: "history",   label: `📋 Historial (${sales.length})` },
    { key: "cierre",    label: "💰 Cierre del día" },
  ];

  // Auto-switch to cierre tab if query param says so
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "cierre") setTab("cierre");
    }
  }, []);

  return (
    <div>
      {invoice && (
        <InvoiceModal data={invoice} onClose={() => setInvoice(null)} />
      )}
      {showPicker && (
        <ProductPickerModal
          items={items}
          cart={cart}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      )}

      <PageHeader
        title="Ventas"
        subtitle="Registra transacciones y analiza tu desempeño"
        action={
          tab === "history" && sales.length > 0 ? (
            <div className="flex items-center gap-2">
              <button onClick={exportCSV}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                <Download size={15} /> Exportar CSV
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition print:hidden">
                <Receipt size={15} /> PDF
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap
              ${tab === t.key ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Nueva venta ── */}
      {tab === "register" && !cajaOpen && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <Lock size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-700 font-semibold text-lg mb-1">Caja cerrada</p>
          <p className="text-sm text-slate-400 mb-5">Debes abrir la caja antes de registrar ventas</p>
          <p className="text-xs text-slate-400">Ve a la parte superior y haz clic en <strong>Abrir caja</strong></p>
        </div>
      )}

      {tab === "register" && cajaOpen && (items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
            <ShoppingCart size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 mb-1">No tienes productos en inventario</p>
            <p className="text-sm text-slate-400">Ve a <strong>Inventario</strong> para agregar productos primero.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* ── Left: buscador + carrito ── */}
              <div className="lg:col-span-3 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-slate-800 mb-3">Agregar productos</h2>
                  <ProductSearch items={items} cart={cart} onAdd={addToCart} onOpenPicker={() => setShowPicker(true)} />
                </div>

                {cart.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-14 text-center">
                    <ShoppingCart size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-400 text-sm font-medium">Carrito vacío</p>
                    <p className="text-slate-400 text-xs mt-1">Busca y selecciona productos arriba</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-sm font-medium text-slate-600">
                        {cart.length} producto{cart.length !== 1 ? "s" : ""} · {cartUnits} unidades
                      </p>
                      <button type="button" onClick={() => setCart([])}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition">
                        <Trash2 size={12} /> Vaciar carrito
                      </button>
                    </div>
                    {cart.map((item) => (
                      <CartRow
                        key={item.inventoryId}
                        item={item}
                        onChange={(patch) => updateCartItem(item.inventoryId, patch)}
                        onRemove={() => removeFromCart(item.inventoryId)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Right: detalles + resumen ── */}
              <div className="lg:col-span-2 space-y-4">

                {/* Payment status */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Estado de pago</h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(["pagado", "pendiente", "credito"] as PaymentStatus[]).map((s) => {
                      const meta   = PAYMENT_STATUS[s];
                      const active = paymentStatus === s;
                      return (
                        <button key={s} type="button" onClick={() => setPaymentStatus(s)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition
                            ${active ? `${meta.color} shadow-sm` : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                          {meta.icon}
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {paymentStatus === "credito" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de vencimiento</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  )}
                </div>

                {/* Order details */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">Datos del cliente</h3>

                  {/* Client name — autocomplete from saved customers */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nombre / Razón social *</label>
                    {customers.length > 0 && !client && (
                      <div className="mb-1.5">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const c = customers.find((x) => x.id === e.target.value);
                            if (c) {
                              setClient(c.name);
                              setClientRnc(c.rnc);
                              setClientPhone(c.phone);
                              setClientEmail(c.email);
                              setClientAddress(c.address);
                            }
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                        >
                          <option value="">— Seleccionar cliente guardado —</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <input value={client} onChange={(e) => { setClient(e.target.value); setFormErrors((p) => ({ ...p, client: "" })); }} placeholder="Nombre o empresa"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${formErrors.client ? "border-red-400" : "border-slate-200"}`} />
                    {formErrors.client && <p className="text-xs text-red-500 mt-0.5">{formErrors.client}</p>}
                    {client && (
                      <button type="button" onClick={() => { setClient(""); setClientRnc(""); setClientPhone(""); setClientEmail(""); setClientAddress(""); }}
                        className="absolute right-2 bottom-2 text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* RNC + Phone */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">RNC / Cédula</label>
                      <input value={clientRnc} onChange={(e) => setClientRnc(e.target.value)} placeholder="000-0000000-0"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                      <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="809-000-0000"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="cliente@empresa.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                    <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Calle, ciudad"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>

                  {/* Route + Zone */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Ruta *</label>
                      <input value={route} onChange={(e) => { setRoute(e.target.value); setFormErrors((p) => ({ ...p, route: "" })); }} placeholder="ej. Norte, Sur"
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${formErrors.route ? "border-red-400" : "border-slate-200"}`} />
                      {formErrors.route && <p className="text-xs text-red-500 mt-0.5">{formErrors.route}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Zona / Ciudad</label>
                      <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="ej. Santo Domingo"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>

                  {/* Date + NCF */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de venta</label>
                      <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        NCF <span className="text-slate-400 font-normal">(auto si vacío)</span>
                      </label>
                      <input value={ncf} onChange={(e) => setNcf(e.target.value)} placeholder="B02XXXXXXXX"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notas / Observaciones</label>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales para la factura…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Resumen del pedido</h3>
                  <div className="space-y-2 mb-4">
                    {[
                      { label: "Subtotal",  value: fmtCurrency(cartTotal),  color: "text-slate-800" },
                      { label: "Costo",     value: fmtCurrency(cartCost),   color: "text-red-500" },
                      { label: "Ganancia",  value: fmtCurrency(cartProfit), color: cartProfit >= 0 ? "text-emerald-600" : "text-red-500" },
                      { label: "Margen",    value: `${cartMargin.toFixed(1)}%`,
                        color: cartMargin >= 20 ? "text-emerald-600" : cartMargin >= 10 ? "text-amber-500" : "text-red-500" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">{label}</span>
                        <span className={`font-semibold ${color}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 pt-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">TOTAL</span>
                      <span className="text-xl font-bold text-indigo-600">{fmtCurrency(cartTotal)}</span>
                    </div>
                  </div>
                  <button type="submit" disabled={saving || cart.length === 0}
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm">
                    {saving
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Registrando…</>
                      : <><ShoppingCart size={16} /> Registrar venta</>}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ))}

      {/* ── Análisis ── */}
      {tab === "analytics" && (
        <div>
          <div className="mb-5">
            <PeriodSelect value={period} onChange={setPeriod} />
          </div>
          {sales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <BarChart2 size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-400">No hay datos de ventas en este período</p>
            </div>
          ) : (
            <AnalyticsTab sales={sales} />
          )}
        </div>
      )}

      {/* ── Historial ── */}
      {tab === "history" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <PeriodSelect value={period} onChange={setPeriod} />
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={histSearch}
                onChange={(e) => { setHistSearch(e.target.value); histPagination.reset(); }}
                placeholder="Buscar producto, cliente, ruta…"
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "pagado", "pendiente", "credito"] as const).map((f) => (
                <button key={f} type="button" onClick={() => { setHistPayFilter(f); histPagination.reset(); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition
                    ${histPayFilter === f ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {f === "all" ? "Todos" : PAYMENT_STATUS[f].label}
                </button>
              ))}
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <EmptyState icon={ShoppingCart} title="Sin ventas en este período" description="Registra tu primera venta usando el tab de Registrar o la tecla rápida V desde cualquier pantalla." action={{ label: "Registrar venta", onClick: () => setTab("register") }} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Mobile cards */}
              <div className="block sm:hidden divide-y divide-slate-50">
                {histPagination.paged.map((s) => {
                  const psMeta = PAYMENT_STATUS[s.paymentStatus ?? "pagado"];
                  return (
                    <button key={s.id} type="button" onClick={() => openSaleInvoice(s)}
                      className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-semibold text-slate-900 truncate flex-1">{s.productName}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${psMeta.color}`}>
                          {psMeta.icon} {psMeta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>{fmtDate(s.saleDate)}</span>
                        <span className="font-mono">{s.sku}</span>
                        {s.client && <span>{s.client}</span>}
                        {s.route  && <span>{s.route}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-slate-500">{s.quantity} u × {fmtCurrency(s.unitPrice)}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${s.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {fmtCurrency(s.profit)}
                          </span>
                          <span className="text-sm font-bold text-indigo-600">{fmtCurrency(s.totalRevenue)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                      {["Fecha","Producto","SKU","Cant.","Precio u.","Ruta","Cliente","Pago","Ingreso","Ganancia","FC"].map((h) => (
                        <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histPagination.paged.map((s) => {
                      const psMeta = PAYMENT_STATUS[s.paymentStatus ?? "pagado"];
                      return (
                        <tr key={s.id}
                          onClick={() => openSaleInvoice(s)}
                          className="border-t border-slate-50 hover:bg-brand-50 cursor-pointer transition-colors">
                          <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{fmtDate(s.saleDate)}</td>
                          <td className="py-2.5 px-4 font-medium max-w-[140px] truncate">{s.productName}</td>
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{s.sku}</td>
                          <td className="py-2.5 px-4">{s.quantity}</td>
                          <td className="py-2.5 px-4">{fmtCurrency(s.unitPrice)}</td>
                          <td className="py-2.5 px-4 text-slate-500">{s.route || "—"}</td>
                          <td className="py-2.5 px-4 text-slate-500">{s.client || "—"}</td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${psMeta.color}`}>
                              {psMeta.icon} {psMeta.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-indigo-600 font-medium whitespace-nowrap">{fmtCurrency(s.totalRevenue)}</td>
                          <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${s.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {fmtCurrency(s.profit)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg border border-brand-100 hover:bg-brand-100 transition">
                              <Receipt size={11} /> Ver
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={histPagination.page}
                totalPages={histPagination.totalPages}
                total={histPagination.total}
                pageSize={20}
                onPage={histPagination.setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Cierre del día ── */}
      {tab === "cierre" && user && (
        <CierreTab sales={sales} uid={user.uid} />
      )}
    </div>
  );
}
