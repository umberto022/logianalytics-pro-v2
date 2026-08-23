"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Edit2, Trash2, X, Search, Layers, AlertTriangle,
  Factory, History, SlidersHorizontal, PackagePlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import {
  addRawMaterial, updateRawMaterial, deleteRawMaterial, adjustRawMaterialStock,
  listRawMaterialMovements,
} from "@/lib/firestore/rawMaterials";
import { registerProduction, listProductionRecords } from "@/lib/firestore/production";
import { useRawMaterials, useInvalidateRawMaterials } from "@/hooks/useRawMaterials";
import { useInventory, useInvalidateInventory } from "@/hooks/useInventory";
import { rawMaterialSchema, zodErrors } from "@/lib/schemas";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { fmtCurrency, fmtDatetime } from "@/lib/utils";
import type { RawMaterial, RawMaterialMovement, ProductionRecord } from "@/types";

type Tab = "insumos" | "produccion" | "historial";

const EMPTY_RM = { name: "", unit: "unidad", unitCost: 0, currentStock: 0, minStock: 0, supplier: "", notes: "" };

const inp = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";

function stockBadge(rm: RawMaterial) {
  if (rm.currentStock <= rm.minStock) {
    return { label: "Crítico", color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" };
  }
  if (rm.minStock > 0 && rm.currentStock <= rm.minStock * 1.5) {
    return { label: "Bajo", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
  }
  return { label: "OK", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
}

export default function InsumosPage() {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const { rawMaterials, loading } = useRawMaterials();
  const invalidateRaw = useInvalidateRawMaterials();
  const { items: products } = useInventory();
  const invalidateInventory = useInvalidateInventory();

  const [tab, setTab] = useState<Tab>("insumos");

  // ─────────────────────────── Insumos: CRUD ───────────────────────────
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState({ ...EMPTY_RM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RawMaterial | null>(null);
  const [adjusting, setAdjusting] = useState<RawMaterial | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_RM });
    setFormErrors({});
    setShowForm(true);
  }

  function openEdit(rm: RawMaterial) {
    setEditing(rm);
    setForm({
      name: rm.name, unit: rm.unit, unitCost: rm.unitCost,
      currentStock: rm.currentStock, minStock: rm.minStock,
      supplier: rm.supplier, notes: rm.notes,
    });
    setFormErrors({});
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = rawMaterialSchema.safeParse(form);
    if (!parsed.success) {
      setFormErrors(zodErrors(parsed));
      toast.error("Corrige los errores del formulario");
      return;
    }
    setFormErrors({});
    setSaving(true);
    const r = editing
      ? await updateRawMaterial(workspaceId, editing.id, parsed.data)
      : await addRawMaterial(workspaceId, parsed.data);
    setSaving(false);
    if (r.ok) { toast.success(r.message); invalidateRaw(); setShowForm(false); }
    else toast.error(r.message);
  }

  async function doDelete() {
    if (!user || !confirmDelete) return;
    const rm = confirmDelete;
    setConfirmDelete(null);
    const r = await deleteRawMaterial(workspaceId, rm.id);
    if (r.ok) { toast.success(r.message); invalidateRaw(); }
    else toast.error(r.message);
  }

  function openAdjust(rm: RawMaterial) {
    setAdjusting(rm);
    setAdjustDelta("");
    setAdjustNote("");
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !adjusting) return;
    const delta = Number(adjustDelta);
    if (!delta) { toast.error("Ingresa una cantidad distinta de 0"); return; }
    setAdjustSaving(true);
    const r = await adjustRawMaterialStock(workspaceId, adjusting.id, delta, adjustNote || "Ajuste manual");
    setAdjustSaving(false);
    if (r.ok) { toast.success(r.message); invalidateRaw(); setAdjusting(null); }
    else toast.error(r.message);
  }

  const filtered = rawMaterials.filter((rm) => {
    const q = search.toLowerCase();
    return !q || rm.name.toLowerCase().includes(q) || rm.supplier.toLowerCase().includes(q);
  });

  const total = rawMaterials.length;
  const stockValue = rawMaterials.reduce((s, rm) => s + rm.currentStock * rm.unitCost, 0);
  const critical = rawMaterials.filter((rm) => rm.currentStock <= rm.minStock).length;
  const withSupplier = rawMaterials.filter((rm) => rm.supplier).length;

  // ─────────────────────────── Producción ───────────────────────────
  const [prodInventoryId, setProdInventoryId] = useState("");
  const [prodQty, setProdQty] = useState("");
  const [prodLabor, setProdLabor] = useState("");
  const [prodOther, setProdOther] = useState("");
  const [prodNote, setProdNote] = useState("");
  const [consumedRows, setConsumedRows] = useState<{ rawMaterialId: string; quantityUsed: string }[]>([]);
  const [registering, setRegistering] = useState(false);

  const rawMap = useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);
  const validRows = consumedRows
    .map((r) => ({ rawMaterialId: r.rawMaterialId, quantityUsed: Number(r.quantityUsed) }))
    .filter((r) => r.rawMaterialId && r.quantityUsed > 0);
  const materialsCost = validRows.reduce((s, r) => {
    const rm = rawMap.get(r.rawMaterialId);
    return s + (rm ? rm.unitCost * r.quantityUsed : 0);
  }, 0);
  const laborNum = Number(prodLabor) || 0;
  const otherNum = Number(prodOther) || 0;
  const qtyNum = Number(prodQty) || 0;
  const totalCost = materialsCost + laborNum + otherNum;
  const costPerUnit = qtyNum > 0 ? totalCost / qtyNum : 0;
  const selectedProduct = products.find((p) => p.id === prodInventoryId) ?? null;
  const resultingMargin = selectedProduct && selectedProduct.salePrice > 0
    ? ((selectedProduct.salePrice - costPerUnit) / selectedProduct.salePrice) * 100
    : null;

  function addConsumedRow() {
    setConsumedRows((rows) => [...rows, { rawMaterialId: "", quantityUsed: "" }]);
  }
  function updateConsumedRow(i: number, patch: Partial<{ rawMaterialId: string; quantityUsed: string }>) {
    setConsumedRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeConsumedRow(i: number) {
    setConsumedRows((rows) => rows.filter((_, idx) => idx !== i));
  }
  function resetProductionForm() {
    setProdInventoryId(""); setProdQty(""); setProdLabor(""); setProdOther(""); setProdNote(""); setConsumedRows([]);
  }

  async function handleRegisterProduction(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!prodInventoryId) { toast.error("Selecciona el producto que fabricaste"); return; }
    if (qtyNum <= 0) { toast.error("La cantidad producida debe ser mayor a 0"); return; }
    if (validRows.length === 0) { toast.error("Agrega al menos un insumo consumido"); return; }
    setRegistering(true);
    const r = await registerProduction(workspaceId, {
      inventoryId: prodInventoryId,
      quantityProduced: qtyNum,
      consumed: validRows,
      laborCost: laborNum,
      otherCosts: otherNum,
      note: prodNote,
    });
    setRegistering(false);
    if (r.ok) {
      toast.success(r.message);
      invalidateRaw();
      invalidateInventory();
      resetProductionForm();
    } else {
      toast.error(r.message);
    }
  }

  // ─────────────────────────── Historial ───────────────────────────
  const [historyView, setHistoryView] = useState<"produccion" | "insumos">("produccion");
  const [historyDays, setHistoryDays] = useState(30);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [prodRecords, setProdRecords] = useState<ProductionRecord[]>([]);
  const [rmMovements, setRmMovements] = useState<RawMaterialMovement[]>([]);

  useEffect(() => {
    if (tab !== "historial" || !workspaceId) return;
    setHistoryLoading(true);
    const p = historyView === "produccion"
      ? listProductionRecords(workspaceId, historyDays).then(setProdRecords)
      : listRawMaterialMovements(workspaceId, historyDays).then(setRmMovements);
    p.finally(() => setHistoryLoading(false));
  }, [tab, historyView, historyDays, workspaceId]);

  const TABS: { key: Tab; label: string; icon: typeof Layers }[] = [
    { key: "insumos",    label: "Insumos",    icon: Layers },
    { key: "produccion", label: "Producción", icon: Factory },
    { key: "historial",  label: "Historial",  icon: History },
  ];

  return (
    <div>
      {/* ── Form modal (add/edit insumo) ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{editing ? "Editar insumo" : "Nuevo insumo"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ej. Limpiapipas"
                  className={`${inp} ${formErrors.name ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                {formErrors.name && <p className="text-xs text-red-500 mt-0.5">{formErrors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Unidad *</label>
                  <input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="unidad, kg, m, paquete…"
                    className={`${inp} ${formErrors.unit ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors.unit && <p className="text-xs text-red-500 mt-0.5">{formErrors.unit}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Costo por unidad *</label>
                  <input type="number" step="0.01" value={form.unitCost}
                    onChange={(e) => setForm((p) => ({ ...p, unitCost: Number(e.target.value) }))}
                    className={`${inp} ${formErrors.unitCost ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors.unitCost && <p className="text-xs text-red-500 mt-0.5">{formErrors.unitCost}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Stock actual</label>
                  <input type="number" step="0.01" value={form.currentStock}
                    onChange={(e) => setForm((p) => ({ ...p, currentStock: Number(e.target.value) }))}
                    className={`${inp} ${formErrors.currentStock ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors.currentStock && <p className="text-xs text-red-500 mt-0.5">{formErrors.currentStock}</p>}
                  {editing && <p className="text-[11px] text-slate-400 mt-0.5">Para entradas/salidas puntuales usa &quot;Ajustar stock&quot; en la tabla — así queda en el historial.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Stock mínimo</label>
                  <input type="number" step="0.01" value={form.minStock}
                    onChange={(e) => setForm((p) => ({ ...p, minStock: Number(e.target.value) }))}
                    className={`${inp} ${formErrors.minStock ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors.minStock && <p className="text-xs text-red-500 mt-0.5">{formErrors.minStock}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Proveedor</label>
                <input value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                  placeholder="Dónde lo compras"
                  className={`${inp} border-slate-200 dark:border-slate-700`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2} className={`${inp} border-slate-200 resize-none dark:border-slate-700`} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {saving ? "Guardando…" : editing ? "Actualizar" : "Crear insumo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick adjust modal ── */}
      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">Ajustar stock</h2>
              <button onClick={() => setAdjusting(null)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {adjusting.name} — stock actual: <strong className="text-slate-700 dark:text-slate-200">{adjusting.currentStock} {adjusting.unit}</strong>
            </p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Cantidad (+ entrada / − salida)</label>
                <input type="number" step="0.01" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="ej. 10 o -5" className={`${inp} border-slate-200 dark:border-slate-700`} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nota</label>
                <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="ej. Compra, merma, conteo físico…" className={`${inp} border-slate-200 dark:border-slate-700`} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAdjusting(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button type="submit" disabled={adjustSaving}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {adjustSaving ? "Guardando…" : "Aplicar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Eliminar insumo"
        description={`¿Estás seguro de que deseas eliminar "${confirmDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <PageHeader
        title="Insumos"
        subtitle="Materia prima de tu producción — el costo real de cada tanda alimenta el margen en Rentabilidad"
        action={tab === "insumos" ? (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition">
            <Plus size={15} /> Nuevo insumo
          </button>
        ) : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
              tab === key
                ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB: Insumos ═══════════════ */}
      {tab === "insumos" && (
        loading ? <TableSkeleton rows={5} cols={6} /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total insumos",     value: total,                 color: "text-slate-800 dark:text-slate-100",   bg: "bg-white dark:bg-slate-800" },
                { label: "Valor en stock",     value: fmtCurrency(stockValue), color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
                { label: "Stock crítico",      value: critical,              color: critical > 0 ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400", bg: critical > 0 ? "bg-red-50 dark:bg-red-500/10" : "bg-white dark:bg-slate-800" },
                { label: "Con proveedor",      value: withSupplier,          color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-2xl border border-slate-100 p-5 shadow-sm dark:border-slate-700`}>
                  <p className="text-xs text-slate-500 font-medium mb-1 dark:text-slate-400">{label}</p>
                  <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="relative mb-4 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o proveedor…"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400" />
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                {search
                  ? <EmptyState icon={Layers} title="Sin resultados" description={`No hay insumos que coincidan con "${search}".`} />
                  : <EmptyState icon={Layers} title="No tienes insumos registrados" description="Registra la materia prima que usas para fabricar tus productos — así el costo de producción deja de ser una suposición." action={{ label: "Agregar primer insumo", onClick: openAdd }} />}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-700/40 dark:border-slate-700 dark:text-slate-400">
                        {["Insumo", "Costo/u", "Stock", "Proveedor", "Estado", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                      {filtered.map((rm) => {
                        const badge = stockBadge(rm);
                        return (
                          <tr key={rm.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/50">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{rm.name}</p>
                              {rm.notes && <p className="text-xs text-slate-400 mt-0.5 max-w-[220px] truncate">{rm.notes}</p>}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtCurrency(rm.unitCost)} / {rm.unit}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {rm.currentStock} {rm.unit}
                              <span className="block text-xs text-slate-400">mín. {rm.minStock}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{rm.supplier || "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${badge.color}`}>
                                {badge.label === "Crítico" && <AlertTriangle size={10} />}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => openAdjust(rm)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition dark:hover:bg-indigo-500/15" title="Ajustar stock">
                                  <SlidersHorizontal size={14} />
                                </button>
                                <button onClick={() => openEdit(rm)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition dark:hover:bg-brand-500/15">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => setConfirmDelete(rm)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition dark:hover:bg-red-500/15">
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
              </div>
            )}
          </>
        )
      )}

      {/* ═══════════════ TAB: Producción ═══════════════ */}
      {tab === "produccion" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleRegisterProduction} className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Registrar producción</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin receta fija: indica qué insumos y cuánto usaste en esta tanda.</p>
            </div>

            {rawMaterials.length === 0 ? (
              <EmptyState icon={Factory} title="Aún no tienes insumos" description="Primero registra tus insumos en la pestaña Insumos para poder consumirlos aquí." action={{ label: "Ir a Insumos", onClick: () => setTab("insumos") }} />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Producto fabricado *</label>
                    <select value={prodInventoryId} onChange={(e) => setProdInventoryId(e.target.value)}
                      className={`${inp} border-slate-200 dark:border-slate-700`}>
                      <option value="">Selecciona un producto…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Cantidad producida *</label>
                    <input type="number" step="1" min="0" value={prodQty} onChange={(e) => setProdQty(e.target.value)}
                      placeholder="ej. 20" className={`${inp} border-slate-200 dark:border-slate-700`} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Insumos consumidos *</label>
                    <button type="button" onClick={addConsumedRow}
                      className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                      <Plus size={13} /> Agregar insumo
                    </button>
                  </div>
                  {consumedRows.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                      Ningún insumo agregado todavía
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {consumedRows.map((row, i) => {
                        const chosen = rawMap.get(row.rawMaterialId);
                        const usedQty = Number(row.quantityUsed) || 0;
                        const overStock = chosen && usedQty > chosen.currentStock;
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <select value={row.rawMaterialId} onChange={(e) => updateConsumedRow(i, { rawMaterialId: e.target.value })}
                              className={`${inp} border-slate-200 dark:border-slate-700 flex-[2]`}>
                              <option value="">Insumo…</option>
                              {rawMaterials
                                .filter((rm) => rm.id === row.rawMaterialId || !consumedRows.some((r) => r.rawMaterialId === rm.id))
                                .map((rm) => (
                                  <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
                                ))}
                            </select>
                            <div className="flex-1">
                              <input type="number" step="0.01" min="0" value={row.quantityUsed}
                                onChange={(e) => updateConsumedRow(i, { quantityUsed: e.target.value })}
                                placeholder="Cantidad"
                                className={`${inp} ${overStock ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700"}`} />
                              {chosen && (
                                <p className={`text-[11px] mt-0.5 ${overStock ? "text-red-500" : "text-slate-400"}`}>
                                  disponible: {chosen.currentStock} {chosen.unit}
                                </p>
                              )}
                            </div>
                            <button type="button" onClick={() => removeConsumedRow(i)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition dark:hover:bg-red-500/15">
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Mano de obra</label>
                    <input type="number" step="0.01" min="0" value={prodLabor} onChange={(e) => setProdLabor(e.target.value)}
                      placeholder="0.00" className={`${inp} border-slate-200 dark:border-slate-700`} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Otros costos</label>
                    <input type="number" step="0.01" min="0" value={prodOther} onChange={(e) => setProdOther(e.target.value)}
                      placeholder="empaque, transporte…" className={`${inp} border-slate-200 dark:border-slate-700`} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nota</label>
                  <input value={prodNote} onChange={(e) => setProdNote(e.target.value)}
                    placeholder="ej. Tanda del 23 de agosto" className={`${inp} border-slate-200 dark:border-slate-700`} />
                </div>

                <button type="submit" disabled={registering}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <PackagePlus size={16} /> {registering ? "Registrando…" : "Registrar producción"}
                </button>
              </>
            )}
          </form>

          {/* Preview panel */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 h-fit sticky top-4 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">Costo real estimado</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Costo de insumos</span><span>{fmtCurrency(materialsCost)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Mano de obra</span><span>{fmtCurrency(laborNum)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Otros costos</span><span>{fmtCurrency(otherNum)}</span>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
              <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100">
                <span>Costo total</span><span>{fmtCurrency(totalCost)}</span>
              </div>
            </div>

            <div className="bg-brand-50 dark:bg-brand-500/10 rounded-xl p-4 text-center">
              <p className="text-xs text-brand-700 dark:text-brand-300 font-medium mb-1">Costo real por unidad</p>
              <p className="text-2xl font-extrabold text-brand-700 dark:text-brand-300">
                {qtyNum > 0 ? fmtCurrency(costPerUnit) : "—"}
              </p>
              {qtyNum === 0 && <p className="text-[11px] text-brand-600/70 dark:text-brand-400/70 mt-1">Ingresa la cantidad producida</p>}
            </div>

            {selectedProduct && qtyNum > 0 && (
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                <p>Precio de venta actual: <strong className="text-slate-700 dark:text-slate-200">{fmtCurrency(selectedProduct.salePrice)}</strong></p>
                {resultingMargin !== null && (
                  <p className="flex items-center gap-1">
                    Margen resultante:{" "}
                    <span className={`font-semibold ${resultingMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : resultingMargin >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {resultingMargin.toFixed(1)}%
                    </span>
                  </p>
                )}
                <p className="text-[11px] text-slate-400 mt-1">Al confirmar, este costo reemplaza el costo actual de &quot;{selectedProduct.name}&quot; en Inventario y alimenta Rentabilidad.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ TAB: Historial ═══════════════ */}
      {tab === "historial" && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
              {([
                { key: "produccion" as const, label: "Producciones" },
                { key: "insumos" as const,    label: "Movimientos de insumos" },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => setHistoryView(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    historyView === key
                      ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm"
                      : "text-slate-500 dark:text-slate-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <select value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </div>

          {historyLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : historyView === "produccion" ? (
            prodRecords.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <EmptyState icon={Factory} title="Sin producciones en este período" description="Cuando registres una tanda de producción, aparecerá acá con su costo real." />
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400">
                        {["Fecha", "Producto", "Cantidad", "Insumos", "Mano de obra + otros", "Costo/u"].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                      {prodRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDatetime(r.createdAt)}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-100">{r.productName}</td>
                          <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-semibold">+{r.quantityProduced}</td>
                          <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{fmtCurrency(r.materialsCost)}</td>
                          <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{fmtCurrency(r.laborCost + r.otherCosts)}</td>
                          <td className="py-2.5 px-4 font-semibold text-brand-600 dark:text-brand-400">{fmtCurrency(r.costPerUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : rmMovements.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <EmptyState icon={History} title="Sin movimientos en este período" description="Ajustes de stock y consumos de producción aparecerán acá." />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400">
                      {["Fecha", "Insumo", "Tipo", "Cantidad", "Nota"].map((h) => (
                        <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {rmMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDatetime(m.createdAt)}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-100">{m.rawMaterialName}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            m.movementType === "produccion" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" :
                            m.quantity >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          }`}>
                            {m.movementType === "produccion" ? "🏭 Producción" : m.quantity >= 0 ? "🟢 Entrada" : "🟡 Ajuste"}
                          </span>
                        </td>
                        <td className={`py-2.5 px-4 font-semibold ${m.quantity < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{m.note || m.reference || "—"}</td>
                      </tr>
                    ))}
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
