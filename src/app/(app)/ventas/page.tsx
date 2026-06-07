"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  ShoppingCart, Download, Search, Plus, Minus, Trash2, X,
  TrendingUp, Users, Package, DollarSign, CreditCard,
  CheckCircle2, Clock, BarChart2, Award, Receipt,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import Papa from "papaparse";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";
import {
  registerSaleOrder, getSales, computeSummary, computeDailyStats,
  computeByProduct, computeByClient,
} from "@/lib/firestore/sales";
import { fmtCurrency, fmt, fmtDate } from "@/lib/utils";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { InventoryItem, Sale, Period, PaymentStatus } from "@/types";

type Tab = "register" | "analytics" | "history";

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

// ── Product search with live dropdown ─────────────────────────────────────────

function ProductSearch({ items, cart, onAdd }: {
  items: InventoryItem[];
  cart: CartItem[];
  onAdd: (item: InventoryItem) => void;
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
    <div ref={wrapRef} className="relative">
      <div className="relative">
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
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          {results.map((item) => {
            const inCart    = cart.find((c) => c.inventoryId === item.id);
            const noStock   = item.currentStock === 0;
            return (
              <button key={item.id} type="button" disabled={noStock}
                onClick={() => { onAdd(item); setSearch(""); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 transition border-b border-slate-50 last:border-0
                  ${noStock ? "opacity-40 cursor-not-allowed" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {item.name}{item.color ? <span className="text-slate-400 font-normal"> · {item.color}</span> : ""}
                  </p>
                  <p className="text-xs text-slate-400">{item.sku} · {item.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-emerald-600">{fmtCurrency(item.salePrice)}</p>
                  <p className={`text-xs ${item.currentStock <= item.minStock ? "text-red-500" : "text-slate-400"}`}>
                    Stock: {item.currentStock}
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
  );
}

// ── Cart item row ─────────────────────────────────────────────────────────────

function CartRow({ item, onChange, onRemove }: {
  item: CartItem;
  onChange: (patch: Partial<CartItem>) => void;
  onRemove: () => void;
}) {
  const subtotal = item.quantity * item.unitPrice;
  const profit   = item.quantity * (item.unitPrice - item.unitCost);
  const margin   = item.unitPrice > 0 ? ((item.unitPrice - item.unitCost) / item.unitPrice * 100) : 0;

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
        <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
      </div>

      {/* Unit price */}
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">$</span>
          <input type="number" min={0} step="0.01" value={item.unitPrice}
            onChange={(e) => onChange({ unitPrice: Number(e.target.value) })}
            className="w-20 text-right text-sm font-semibold border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <p className={`text-xs font-medium ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {margin.toFixed(0)}% margen
        </p>
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
        <p className={`text-xs ${profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {profit >= 0 ? "+" : ""}{fmtCurrency(profit)}
        </p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VentasPage() {
  const { user } = useAuth();
  const [tab,     setTab]     = useState<Tab>("register");
  const [items,   setItems]   = useState<InventoryItem[]>([]);
  const [sales,   setSales]   = useState<Sale[]>([]);
  const [period,  setPeriod]  = useState<Period>(30);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Cart state
  const [cart,          setCart]          = useState<CartItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pagado");
  const [dueDate,       setDueDate]       = useState("");
  const [route,         setRoute]         = useState("");
  const [zone,          setZone]          = useState("");
  const [client,        setClient]        = useState("");
  const [saleDate,      setSaleDate]      = useState(format(new Date(), "yyyy-MM-dd"));

  // History filter
  const [histPayFilter, setHistPayFilter] = useState<PaymentStatus | "all">("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [inv, sl] = await Promise.all([listInventory(user.uid), getSales(user.uid, period)]);
      setItems(inv);
      setSales(sl);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user, period]);

  useEffect(() => { load(); }, [load]);

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
    setSaving(true);
    const r = await registerSaleOrder(user.uid, {
      items: cart.map((c) => ({ inventoryId: c.inventoryId, quantity: c.quantity, unitPrice: c.unitPrice })),
      route, zone, client,
      saleDate: new Date(saleDate),
      paymentStatus,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      setCart([]);
      setRoute(""); setZone(""); setClient("");
      setPaymentStatus("pagado"); setDueDate("");
      await load();
    } else {
      toast.error(r.message);
    }
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

  const filteredSales = histPayFilter === "all"
    ? sales
    : sales.filter((s) => (s.paymentStatus ?? "pagado") === histPayFilter);

  if (loading) return <FullPageSpinner />;

  const TABS: { key: Tab; label: string }[] = [
    { key: "register",  label: "🛒 Nueva venta" },
    { key: "analytics", label: "📊 Análisis" },
    { key: "history",   label: `📋 Historial (${sales.length})` },
  ];

  return (
    <div>
      <PageHeader
        title="Ventas"
        subtitle="Registra transacciones y analiza tu desempeño"
        action={
          tab === "history" && sales.length > 0 ? (
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <Download size={15} /> Exportar CSV
            </button>
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
      {tab === "register" && (
        items.length === 0 ? (
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
                  <ProductSearch items={items} cart={cart} onAdd={addToCart} />
                  <p className="text-xs text-slate-400 mt-2">Escribe para buscar · haz clic para agregar al carrito</p>
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
                  <h3 className="text-sm font-semibold text-slate-700">Detalles de la venta</h3>
                  {([
                    { label: "Cliente",       value: client,   set: setClient,   placeholder: "Nombre o código" },
                    { label: "Ruta",          value: route,    set: setRoute,    placeholder: "ej. Norte, Sur" },
                    { label: "Zona / Ciudad", value: zone,     set: setZone,     placeholder: "ej. Santo Domingo" },
                  ] as const).map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de venta</label>
                    <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)}
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
        )
      )}

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
            <div className="flex gap-1">
              {(["all", "pagado", "pendiente", "credito"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setHistPayFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition
                    ${histPayFilter === f ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {f === "all" ? "Todos" : PAYMENT_STATUS[f].label}
                </button>
              ))}
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <ShoppingCart size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-400">No hay ventas en este período</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                      {["Fecha","Producto","SKU","Cant.","Precio u.","Ruta","Cliente","Pago","Ingreso","Ganancia"].map((h) => (
                        <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((s) => {
                      const psMeta = PAYMENT_STATUS[s.paymentStatus ?? "pagado"];
                      return (
                        <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50">
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
