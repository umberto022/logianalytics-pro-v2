"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Plus, Download, Upload, Edit2, Trash2, Package, Search } from "lucide-react";
import Papa from "papaparse";
import { useAuth } from "@/contexts/AuthContext";
import {
  listInventory, addInventoryItem, updateInventoryItem,
  deleteInventoryItem, bulkAddInventory,
} from "@/lib/firestore/inventory";
import { getStockStatus, fmtCurrency, fmt } from "@/lib/utils";
import { StockBadge } from "@/components/ui/StockBadge";
import { KPICard } from "@/components/ui/KPICard";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { InventoryItem } from "@/types";

type Tab = "list" | "add" | "import";

const EMPTY: Omit<InventoryItem, "id" | "sku" | "updatedAt"> = {
  name: "", category: "", color: "", supplier: "",
  currentStock: 0, minStock: 5, maxStock: 100,
  unitCost: 0, salePrice: 0, leadTimeDays: 7,
};

export default function InventarioPage() {
  const { user } = useAuth();
  const [tab,     setTab]     = useState<Tab>("list");
  const [items,   setItems]   = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState("");
  const [catFilter, setCatFilter] = useState("Todos");
  const [form,    setForm]    = useState(EMPTY);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setItems(await listInventory(user.uid));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function setF(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: ["currentStock","minStock","maxStock","unitCost","salePrice","leadTimeDays"].includes(k)
        ? Number(e.target.value) : e.target.value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.category) { toast.error("Nombre y tipo son obligatorios"); return; }
    if (!user) return;
    setSaving(true);
    const r = await addInventoryItem(user.uid, form);
    setSaving(false);
    if (r.ok) { toast.success(r.message); setForm(EMPTY); await load(); setTab("list"); }
    else        toast.error(r.message);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !user) return;
    setSaving(true);
    const r = await updateInventoryItem(user.uid, editing.id, form);
    setSaving(false);
    if (r.ok) { toast.success(r.message); setEditing(null); await load(); setTab("list"); }
    else        toast.error(r.message);
  }

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`¿Eliminar "${item.name}"?`) || !user) return;
    const r = await deleteInventoryItem(user.uid, item.id);
    if (r.ok) { toast.success(r.message); await load(); }
    else        toast.error(r.message);
  }

  function startEdit(item: InventoryItem) {
    setEditing(item);
    setForm({
      name: item.name, category: item.category, color: item.color,
      supplier: item.supplier, currentStock: item.currentStock,
      minStock: item.minStock, maxStock: item.maxStock,
      unitCost: item.unitCost, salePrice: item.salePrice,
      leadTimeDays: item.leadTimeDays,
    });
    setTab("add");
  }

  function exportCSV() {
    const rows = items.map(({ sku, name, category, color, currentStock, minStock, maxStock, unitCost, salePrice, supplier }) =>
      ({ sku, producto: name, tipo: category, color, stock: currentStock, stock_minimo: minStock, stock_maximo: maxStock, costo: unitCost, precio_venta: salePrice, proveedor: supplier })
    );
    const csv = Papa.unparse(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `inventario_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !user) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = (res.data as Record<string, string>[]).map((r) => ({
          name: r.producto || r.name || "",
          category: r.tipo || r.category || "",
          color: r.color || "", supplier: r.proveedor || r.supplier || "",
          currentStock: Number(r.stock || 0),
          minStock:     Number(r.stock_minimo || r.minStock || 0),
          maxStock:     Number(r.stock_maximo || r.maxStock || 100),
          unitCost:     Number(r.costo || r.unitCost || 0),
          salePrice:    Number(r.precio_venta || r.salePrice || 0),
          leadTimeDays: 7,
        })).filter((r) => r.name && r.category);

        if (!rows.length) { toast.error("No se encontraron filas válidas"); return; }
        const { imported, errors } = await bulkAddInventory(user.uid, rows);
        toast.success(`${imported} productos importados`);
        if (errors.length) toast.error(`${errors.length} errores`);
        await load();
        setTab("list");
      },
    });
    e.target.value = "";
  }

  const filtered = items.filter((i) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "Todos" || i.category === catFilter;
    return matchSearch && matchCat;
  });

  const categories = ["Todos", ...Array.from(new Set(items.map((i) => i.category))).sort()];
  const criticalCount = items.filter((i) => getStockStatus(i) === "critical").length;
  const lowCount      = items.filter((i) => getStockStatus(i) === "low").length;
  const totalValue    = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Gestiona tus productos y niveles de stock"
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <Download size={15} /> Exportar
            </button>
            <label className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer">
              <Upload size={15} /> Importar CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={() => { setEditing(null); setForm(EMPTY); setTab("add"); }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition font-medium"
            >
              <Plus size={15} /> Agregar
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Productos"          value={fmt(items.length, 0)}      color="indigo" />
        <KPICard label="Valor del inventario" value={fmtCurrency(totalValue)} color="green"  />
        <KPICard label="Stock crítico"      value={String(criticalCount)}     color="red"    />
        <KPICard label="Stock bajo"         value={String(lowCount)}          color="amber"  />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {(["list", "add"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "add" && editing) { setEditing(null); setForm(EMPTY); } }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === t ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t === "list" ? `📋 Mis productos (${items.length})` : (editing ? "✏️ Editar producto" : "➕ Agregar producto")}
          </button>
        ))}
      </div>

      {/* List tab */}
      {tab === "list" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="flex gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select
              value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package size={40} className="mb-3" />
              <p>{items.length === 0 ? "Aún no tienes productos" : "Sin resultados"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50">
                    {["SKU", "Producto", "Tipo", "Color", "Stock", "Mín / Máx", "Costo", "P. Venta", "Estado", ""].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const status = getStockStatus(item);
                    const pct = item.maxStock > 0 ? Math.min(100, (item.currentStock / item.maxStock) * 100) : 0;
                    return (
                      <tr key={item.id} className="border-t border-slate-50 hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{item.sku}</td>
                        <td className="py-3 px-4 font-medium">{item.name}</td>
                        <td className="py-3 px-4 text-slate-600">{item.category}</td>
                        <td className="py-3 px-4 text-slate-500">{item.color || "—"}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{item.currentStock}</span>
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={status === "critical" ? "bg-red-500" : status === "low" ? "bg-amber-400" : "bg-emerald-500"}
                                style={{ width: `${pct}%`, height: "100%", borderRadius: 9999 }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{item.minStock} / {item.maxStock}</td>
                        <td className="py-3 px-4 text-slate-600">{fmtCurrency(item.unitCost)}</td>
                        <td className="py-3 px-4 text-emerald-600 font-medium">{fmtCurrency(item.salePrice)}</td>
                        <td className="py-3 px-4"><StockBadge status={status} /></td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(item)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(item)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit tab */}
      {tab === "add" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-semibold mb-5">{editing ? "Editar producto" : "Registrar nuevo producto"}</h2>
          <form onSubmit={editing ? handleUpdate : handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Nombre del producto *", key: "name" as const, placeholder: "ej. Camiseta manga corta" },
                { label: "Tipo / Categoría *",    key: "category" as const, placeholder: "ej. Ropa, Electrónico" },
                { label: "Color",                 key: "color" as const,    placeholder: "ej. Rojo, Azul" },
                { label: "Proveedor",             key: "supplier" as const, placeholder: "Nombre del proveedor" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input value={String(form[key])} onChange={setF(key)} placeholder={placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              ))}
              {[
                { label: "Stock inicial",       key: "currentStock" as const, min: 0 },
                { label: "Stock mínimo",        key: "minStock" as const,     min: 0 },
                { label: "Stock máximo",        key: "maxStock" as const,     min: 0 },
                { label: "Días de lead time",   key: "leadTimeDays" as const, min: 1 },
                { label: "Costo unitario ($)",  key: "unitCost" as const,     min: 0, step: "0.01" },
                { label: "Precio de venta ($)", key: "salePrice" as const,    min: 0, step: "0.01" },
              ].map(({ label, key, min, step }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input type="number" value={Number(form[key])} onChange={setF(key)} min={min} step={step}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
                {saving ? "Guardando…" : (editing ? "Guardar cambios" : "Agregar al inventario")}
              </button>
              <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); setTab("list"); }}
                className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
