"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Zap, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";
import { registerSale } from "@/lib/firestore/sales";
import { fmtCurrency, fmt } from "@/lib/utils";
import type { InventoryItem } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuickSaleModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [items,  setItems]  = useState<InventoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({
    inventoryId: "", quantity: 1, unitPrice: 0,
    route: "", client: "", saleDate: format(new Date(), "yyyy-MM-dd"),
  });

  const load = useCallback(async () => {
    if (!user || !isOpen) return;
    const inv = await listInventory(user.uid);
    setItems(inv);
    if (inv.length) {
      setForm((p) => ({ ...p, inventoryId: inv[0].id, unitPrice: inv[0].salePrice }));
    }
  }, [user, isOpen]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const selected = items.find((i) => i.id === form.inventoryId);
  const total  = form.quantity * form.unitPrice;
  const cost   = form.quantity * (selected?.unitCost ?? 0);
  const profit = total - cost;
  const pct    = total > 0 ? (profit / total) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inventoryId || !user) return;
    if (form.quantity < 1) { toast.error("La cantidad debe ser al menos 1"); return; }
    if (form.unitPrice <= 0) { toast.error("El precio debe ser mayor a 0"); return; }
    if (selected && form.quantity > selected.currentStock) {
      toast.error(`Stock insuficiente (disponible: ${selected.currentStock})`); return;
    }
    setSaving(true);
    const r = await registerSale(user.uid, {
      inventoryId: form.inventoryId,
      quantity: form.quantity,
      unitPrice: form.unitPrice,
      route: form.route,
      zone: "",
      client: form.client,
      saleDate: new Date(form.saleDate),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      setForm((p) => ({ ...p, quantity: 1, route: "", client: "" }));
      onSuccess?.();
      onClose();
    } else {
      toast.error(r.message);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 z-10 animate-slide-up">
        {/* Handle bar (mobile) */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 sm:hidden" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center shadow-sm">
              <Zap size={17} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-none">Venta rápida</h2>
              <p className="text-xs text-slate-400 mt-0.5">Registra sin salir de esta pantalla</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={17} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <ShoppingCart size={36} className="mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-medium">No tienes productos en inventario</p>
            <p className="text-xs mt-1">Ve a <strong className="text-slate-500">Inventario</strong> para agregarlos primero</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Product */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Producto</label>
              <select
                value={form.inventoryId}
                onChange={(e) => {
                  const item = items.find((i) => i.id === e.target.value);
                  setForm((p) => ({ ...p, inventoryId: e.target.value, unitPrice: item?.salePrice ?? 0 }));
                }}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}{i.color ? ` · ${i.color}` : ""} — stock: {i.currentStock}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="text-xs text-slate-400 mt-1 pl-1">
                  Precio sugerido: <strong className="text-slate-600">{fmtCurrency(selected.salePrice)}</strong>
                </p>
              )}
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Cantidad</label>
                <input
                  type="number" min={1} max={selected?.currentStock}
                  value={form.quantity}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Precio ($)</label>
                <input
                  type="number" min={0.01} step="0.01"
                  value={form.unitPrice}
                  onChange={(e) => setForm((p) => ({ ...p, unitPrice: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Ruta</label>
                <input
                  value={form.route}
                  placeholder="ej. Norte, Sur"
                  onChange={(e) => setForm((p) => ({ ...p, route: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Cliente</label>
                <input
                  value={form.client}
                  placeholder="Nombre o código"
                  onChange={(e) => setForm((p) => ({ ...p, client: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                />
              </div>
            </div>

            {/* Live profit preview */}
            <div className="bg-gradient-to-r from-slate-50 to-brand-50 rounded-xl px-4 py-3 border border-slate-100 flex items-center gap-0 divide-x divide-slate-200">
              {[
                { label: "Total",    value: fmtCurrency(total),  color: "text-indigo-600" },
                { label: "Ganancia", value: fmtCurrency(profit), color: profit >= 0 ? "text-emerald-600" : "text-red-500" },
                { label: "Margen",   value: `${fmt(pct, 1)}%`,   color: pct >= 20 ? "text-emerald-600" : pct >= 10 ? "text-amber-500" : "text-red-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex-1 px-3 text-center">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className={`font-bold text-sm ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Registrando…</>
              ) : (
                <><Zap size={16} /> Registrar venta</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
