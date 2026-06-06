"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  Plus, Download, Upload, Edit2, Trash2, Package,
  Search, Camera, X, Image as ImageIcon,
  BarChart2, AlertTriangle, TrendingDown, DollarSign,
  Boxes, ShoppingBag, ChevronRight,
} from "lucide-react";
import Papa from "papaparse";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, PieChart, Pie, Legend,
} from "recharts";
const CLOUDINARY_CLOUD  = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME  ?? "").trim();
const CLOUDINARY_PRESET = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "").trim();
import { useAuth } from "@/contexts/AuthContext";
import {
  listInventory, addInventoryItem, updateInventoryItem,
  deleteInventoryItem, bulkAddInventory,
} from "@/lib/firestore/inventory";
import { getStockStatus, fmtCurrency, fmt } from "@/lib/utils";
import { StockBadge } from "@/components/ui/StockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { InventoryItem, StockStatus } from "@/types";

type Tab = "dashboard" | "list" | "add";
type ActiveFilter = "all" | "critical" | "low" | "ok" | string; // string = category name

const EMPTY: Omit<InventoryItem, "id" | "sku" | "updatedAt"> = {
  name: "", category: "", color: "", supplier: "",
  currentStock: 0, minStock: 5, maxStock: 100,
  unitCost: 0, salePrice: 0, leadTimeDays: 7, imageUrl: "",
};

// ─────────────────────── Animated counter ────────────────────────────────────

function useCounter(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

// ─────────────────────── Stat card (clickable) ───────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color, active, onClick,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl border p-5 shadow-sm
        hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group relative overflow-hidden
        ${active ? "ring-2 ring-brand-500 border-brand-200" : "border-slate-100"}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"} ${color} transition-opacity`} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${color.replace("bg-", "bg-").replace("500","50")} ${color.replace("bg-","text-").replace("500","600")}`}>
          <Icon size={17} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
      {active && (
        <span className="absolute bottom-3 right-3 text-xs text-brand-500 font-medium flex items-center gap-0.5">
          Filtrando <ChevronRight size={12} />
        </span>
      )}
    </button>
  );
}

// ─────────────────────── Photo picker ────────────────────────────────────────

function PhotoPicker({ current, onChange, onUploading }: {
  current: string;
  onChange: (url: string) => void;
  onUploading?: (uploading: boolean) => void;
}) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode,      setMode]      = useState<"idle" | "camera">("idle");
  const [preview,   setPreview]   = useState(current);
  const [uploading, setUploading] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  async function uploadFile(blob: Blob, name: string) {
    if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
      toast.error("Configuración de Cloudinary faltante. Verifica las variables de entorno.");
      return;
    }
    setUploading(true);
    onUploading?.(true);
    try {
      const form = new FormData();
      form.append("file", blob, name);
      form.append("upload_preset", CLOUDINARY_PRESET);
      form.append("folder", "inventory-photos");
      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        console.error("Cloudinary error:", data);
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      setPreview(data.secure_url);
      onChange(data.secure_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error subiendo foto: ${msg}`);
    } finally {
      setUploading(false);
      onUploading?.(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file, file.name);
    e.target.value = "";
  }

  async function startCamera() {
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch {
      toast.error("No se pudo acceder a la cámara");
      setMode("idle");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMode("idle");
  }

  async function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    canvasRef.current.width  = v.videoWidth;
    canvasRef.current.height = v.videoHeight;
    canvasRef.current.getContext("2d")!.drawImage(v, 0, 0);
    stopCamera();
    canvasRef.current.toBlob(async (blob) => {
      if (blob) await uploadFile(blob, "camara.jpg");
    }, "image/jpeg", 0.8);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        Foto del producto <span className="text-slate-400 font-normal">(opcional)</span>
      </label>
      {preview && (
        <div className="relative w-24 h-24 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="producto" className="w-24 h-24 object-cover rounded-xl border border-slate-200"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <button type="button" onClick={() => { setPreview(""); onChange(""); }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
            <X size={10} />
          </button>
        </div>
      )}
      {mode === "camera" && (
        <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 bg-black relative">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="w-full max-h-56 object-cover" autoPlay playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
            <button type="button" onClick={capturePhoto}
              className="px-5 py-2 bg-white text-slate-900 rounded-full text-sm font-semibold shadow hover:bg-slate-100 transition">
              📸 Capturar
            </button>
            <button type="button" onClick={stopCamera}
              className="px-4 py-2 bg-red-500 text-white rounded-full text-sm font-semibold shadow hover:bg-red-600 transition">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {uploading ? (
        <p className="text-sm text-brand-600 animate-pulse">Subiendo imagen…</p>
      ) : mode === "idle" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
            <ImageIcon size={14} /> Subir foto
          </button>
          <button type="button" onClick={startCamera}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
            <Camera size={14} /> Tomar foto
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────── Product thumbnail ───────────────────────────────────

function ProductThumb({ url, name }: { url?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (url && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="w-10 h-10 object-cover rounded-lg border border-slate-200"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
      <Package size={16} />
    </div>
  );
}

// ─────────────────────── Dashboard panel ─────────────────────────────────────

const STATUS_COLORS: Record<StockStatus, string> = {
  critical: "#ef4444",
  low:      "#f59e0b",
  ok:       "#10b981",
};

const CHART_COLORS = [
  "#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

function InventoryDashboard({
  items, activeFilter, onFilter,
}: {
  items: InventoryItem[];
  activeFilter: ActiveFilter;
  onFilter: (f: ActiveFilter) => void;
}) {
  const critical = items.filter((i) => getStockStatus(i) === "critical");
  const low      = items.filter((i) => getStockStatus(i) === "low");
  const ok       = items.filter((i) => getStockStatus(i) === "ok");
  const totalVal = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
  const totalPotential = items.reduce((s, i) => s + i.currentStock * i.salePrice, 0);
  const totalUnits = items.reduce((s, i) => s + i.currentStock, 0);

  // animated counters
  const cTotal    = useCounter(items.length);
  const cUnits    = useCounter(totalUnits);
  const cCritical = useCounter(critical.length);
  const cLow      = useCounter(low.length);

  // Category breakdown
  const byCategory = Object.entries(
    items.reduce<Record<string, { units: number; value: number; count: number }>>((acc, i) => {
      const cat = i.category || "Sin categoría";
      if (!acc[cat]) acc[cat] = { units: 0, value: 0, count: 0 };
      acc[cat].units += i.currentStock;
      acc[cat].value += i.currentStock * i.unitCost;
      acc[cat].count += 1;
      return acc;
    }, {})
  )
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.value - a.value);

  // Status distribution for pie
  const pieData = [
    { name: "Óptimo",   value: ok.length,       color: "#10b981" },
    { name: "Bajo",     value: low.length,       color: "#f59e0b" },
    { name: "Crítico",  value: critical.length,  color: "#ef4444" },
  ].filter((d) => d.value > 0);

  // Top 8 products by value
  const topProducts = [...items]
    .sort((a, b) => b.currentStock * b.unitCost - a.currentStock * a.unitCost)
    .slice(0, 8)
    .map((i) => ({
      name: i.name.length > 14 ? i.name.slice(0, 14) + "…" : i.name,
      valor: parseFloat((i.currentStock * i.unitCost).toFixed(2)),
      status: getStockStatus(i),
    }));

  const toggle = (f: ActiveFilter) => onFilter(activeFilter === f ? "all" : f);

  return (
    <div className="space-y-6">
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total productos" value={fmt(cTotal, 0)} icon={Boxes} color="bg-indigo-500"
          sub={`${fmt(cUnits, 0)} unidades en stock`}
          active={activeFilter === "all"} onClick={() => onFilter("all")}
        />
        <StatCard
          label="Valor del inventario" value={fmtCurrency(totalVal)} icon={DollarSign} color="bg-emerald-500"
          sub={`Potencial venta ${fmtCurrency(totalPotential)}`}
          active={false} onClick={() => {}}
        />
        <StatCard
          label="Stock crítico" value={fmt(cCritical, 0)} icon={AlertTriangle} color="bg-red-500"
          sub={critical.length > 0 ? `${critical.map(i => i.name).slice(0,2).join(", ")}…` : "Todo en orden ✓"}
          active={activeFilter === "critical"} onClick={() => toggle("critical")}
        />
        <StatCard
          label="Stock bajo" value={fmt(cLow, 0)} icon={TrendingDown} color="bg-amber-500"
          sub={low.length > 0 ? "Reabastecer pronto" : "Sin alertas"}
          active={activeFilter === "low"} onClick={() => toggle("low")}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Top productos por valor */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-700">Top productos por valor en stock</h3>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,.1)", fontSize: 12 }}
                  formatter={(v: number) => [`$${fmt(v)}`, "Valor"]}
                />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {topProducts.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-2 justify-center">
            {Object.entries(STATUS_COLORS).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
                {s === "critical" ? "Crítico" : s === "low" ? "Bajo" : "Óptimo"}
              </span>
            ))}
          </div>
        </div>

        {/* Estado del stock - donut */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={16} className="text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-700">Estado del stock</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                  dataKey="value" paddingAngle={3}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "none", fontSize: 12 }}
                  formatter={(v: number) => [`${v} productos`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-col gap-1.5 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-semibold text-slate-800">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Por categoría ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Stock por categoría</h3>
        {byCategory.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Sin datos</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(({ name, units, value, count }, idx) => {
              const maxVal = byCategory[0].value;
              const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
              const isActive = activeFilter === name;
              return (
                <button
                  key={name}
                  onClick={() => toggle(name)}
                  className={`w-full text-left group transition-all rounded-xl p-2 -mx-2 ${isActive ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium flex items-center gap-2 ${isActive ? "text-indigo-700" : "text-slate-700"}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      {name}
                      <span className="text-slate-400 font-normal text-xs">({count} prod.)</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{fmt(units, 0)} u · {fmtCurrency(value)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: CHART_COLORS[idx % CHART_COLORS.length] }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── Main page ───────────────────────────────────────────

export default function InventarioPage() {
  const { user } = useAuth();
  const [tab,          setTab]          = useState<Tab>("dashboard");
  const [items,        setItems]        = useState<InventoryItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [form,           setForm]           = useState(EMPTY);
  const [editing,        setEditing]        = useState<InventoryItem | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await listInventory(user.uid));
    } catch (e) {
      console.error("inventario load error:", e);
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function setF(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: ["currentStock","minStock","maxStock","unitCost","salePrice","leadTimeDays"].includes(k)
        ? Number(e.target.value) : e.target.value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.category.trim()) { toast.error("Nombre y tipo son obligatorios"); return; }
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
      leadTimeDays: item.leadTimeDays, imageUrl: item.imageUrl ?? "",
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
          leadTimeDays: 7, imageUrl: "",
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

  // Apply active filter to product list
  const filtered = items.filter((i) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase());
    const status = getStockStatus(i);
    const matchFilter =
      activeFilter === "all"      ? true :
      activeFilter === "critical" ? status === "critical" :
      activeFilter === "low"      ? status === "low" :
      activeFilter === "ok"       ? status === "ok" :
      i.category === activeFilter;
    return matchSearch && matchFilter;
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "list",      label: `📋 Productos (${items.length})` },
    { key: "add",       label: editing ? "✏️ Editar" : "➕ Agregar" },
  ];

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Gestiona tus productos y niveles de stock"
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">
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

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key !== "add") { setEditing(null); setForm(EMPTY); } }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === t.key ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {tab === "dashboard" && (
        <div>
          {items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <Package size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 mb-4">Agrega productos para ver tu dashboard</p>
              <button onClick={() => setTab("add")}
                className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition">
                Agregar primer producto
              </button>
            </div>
          ) : (
            <InventoryDashboard
              items={items}
              activeFilter={activeFilter}
              onFilter={(f) => { setActiveFilter(f); setTab("list"); }}
            />
          )}
        </div>
      )}

      {/* ── List tab ── */}
      {tab === "list" && (
        <div>
          {/* Active filter pill */}
          {activeFilter !== "all" && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500">Filtrando por:</span>
              <span className="flex items-center gap-1.5 px-3 py-1 bg-brand-100 text-brand-700 text-xs font-medium rounded-full">
                {activeFilter === "critical" ? "🔴 Stock crítico" :
                 activeFilter === "low"      ? "🟡 Stock bajo" :
                 activeFilter === "ok"       ? "🟢 Óptimo" : `📦 ${activeFilter}`}
                <button onClick={() => setActiveFilter("all")} className="hover:text-brand-900 transition">
                  <X size={12} />
                </button>
              </span>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex gap-3 p-4 border-b border-slate-100">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU…"
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
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
                      {["📷","SKU","Producto","Tipo","Color","Stock","Mín/Máx","Costo","P.Venta","Estado",""].map((h) => (
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
                          <td className="py-3 px-4">
                            <ProductThumb url={item.imageUrl} name={item.name} />
                          </td>
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
        </div>
      )}

      {/* ── Add / Edit tab ── */}
      {tab === "add" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-semibold mb-5">{editing ? "Editar producto" : "Registrar nuevo producto"}</h2>
          <form onSubmit={editing ? handleUpdate : handleAdd} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Nombre del producto *", key: "name" as const,     placeholder: "ej. Camiseta manga corta" },
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
            <PhotoPicker
              current={form.imageUrl ?? ""}
              onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))}
              onUploading={setImageUploading}
            />
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving || imageUploading}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
                {imageUploading ? "Subiendo foto…" : saving ? "Guardando…" : (editing ? "Guardar cambios" : "Agregar al inventario")}
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
