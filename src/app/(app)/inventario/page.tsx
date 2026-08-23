"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import QRCode from "qrcode";
import {
  Plus, Download, Upload, Edit2, Trash2, Package,
  Search, Camera, X, Image as ImageIcon,
  BarChart2, AlertTriangle, TrendingDown, DollarSign,
  Boxes, ShoppingBag, ChevronRight, ChevronUp, ChevronDown,
  Minus, History, ShoppingCart, QrCode, Printer,
  ArrowUpCircle, ArrowDownCircle, SlidersHorizontal,
  Tag, Layers, Eye, ExternalLink, CheckCircle2, Clock,
  PackageCheck, XCircle, FileText, Factory,
} from "lucide-react";
import Papa from "papaparse";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, PieChart, Pie, LineChart, Line, CartesianGrid,
} from "recharts";

const CLOUDINARY_CLOUD  = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME  ?? "").trim();
const CLOUDINARY_PRESET = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "").trim();

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import {
  listInventory, addInventoryItem, updateInventoryItem,
  deleteInventoryItem, bulkAddInventory, listMovements, adjustStock,
} from "@/lib/firestore/inventory";
import { listPurchaseOrders } from "@/lib/firestore/purchases";
import {
  getLastConteo, getRecentConteos, submitConteo,
  type ConteoRecord, type ConteoItem,
} from "@/lib/firestore/conteo";
import { listSuppliers, type Supplier } from "@/lib/firestore/suppliers";
import { ReceiveOrderModal } from "@/components/ui/ReceiveOrderModal";
import { getStockStatus, fmtCurrency, fmt } from "@/lib/utils";
import { StockBadge } from "@/components/ui/StockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminButton } from "@/components/ui/AdminOnly";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { InventoryItem, InventoryMovement, PurchaseOrder, PurchaseOrderStatus, StockStatus } from "@/types";
import { inventorySchema } from "@/lib/schemas";
import { z } from "zod";

type Tab = "dashboard" | "list" | "add" | "historial" | "ordenes" | "conteo";
type ActiveFilter = "all" | "critical" | "low" | "ok" | string;
type SortKey = "name" | "category" | "currentStock" | "unitCost" | "salePrice" | "supplier";
type SortDir = "asc" | "desc";

const EMPTY: Omit<InventoryItem, "id" | "sku" | "updatedAt"> = {
  name: "", category: "", color: "", supplier: "",
  currentStock: 0, minStock: 5, maxStock: 100,
  unitCost: 0, salePrice: 0, leadTimeDays: 7, imageUrl: "",
};

// ─── Animated counter ────────────────────────────────────────────────────────

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

function esc(s: string | undefined | null) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, active, onClick }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full text-left bg-white dark:bg-slate-800 rounded-2xl border p-5 shadow-sm
        hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group relative overflow-hidden
        ${active ? "ring-2 ring-brand-500 border-brand-200 dark:border-brand-500/40" : "border-slate-100 dark:border-slate-700"}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"} ${color} transition-opacity`} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${color.replace("bg-","bg-").replace("500","50")} ${color.replace("bg-","text-").replace("500","600")}`}>
          <Icon size={17} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-400 mt-1.5">{sub}</p>}
      {active && (
        <span className="absolute bottom-3 right-3 text-xs text-brand-500 font-medium flex items-center gap-0.5">
          Filtrando <ChevronRight size={12} />
        </span>
      )}
    </button>
  );
}

// ─── Photo picker ─────────────────────────────────────────────────────────────

function PhotoPicker({ current, onChange, onUploading }: {
  current: string;
  onChange: (url: string) => void;
  onUploading?: (v: boolean) => void;
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
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Foto del producto <span className="text-slate-400 dark:text-slate-400 font-normal">(opcional)</span>
      </label>
      {preview && (
        <div className="relative w-24 h-24 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="producto" className="w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <button type="button" onClick={() => { setPreview(""); onChange(""); }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
            <X size={10} />
          </button>
        </div>
      )}
      {mode === "camera" && (
        <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black relative">
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
        <p className="text-sm text-brand-600 dark:text-brand-400 animate-pulse">Subiendo imagen…</p>
      ) : mode === "idle" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <ImageIcon size={14} /> Subir foto
          </button>
          <button type="button" onClick={startCamera}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <Camera size={14} /> Tomar foto
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  );
}

// ─── Product thumbnail ────────────────────────────────────────────────────────

function ProductThumb({ url, name }: { url?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (url && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name}
        className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
        onError={() => setErr(true)} />
    );
  }
  return (
    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-500">
      <Package size={16} />
    </div>
  );
}

// ─── Product detail modal ─────────────────────────────────────────────────────

function ProductDetailModal({ item, onClose, onEdit, onAdjust, canEdit }: {
  item: InventoryItem;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  canEdit: boolean;
}) {
  const status = getStockStatus(item);
  const margin = item.salePrice > 0
    ? (((item.salePrice - item.unitCost) / item.salePrice) * 100).toFixed(1)
    : "0";
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Image header */}
        <div className="relative bg-slate-100 dark:bg-slate-700 h-56 flex items-center justify-center">
          {item.imageUrl && !imgErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name}
              className="w-full h-full object-cover"
              onError={() => setImgErr(true)} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-300 dark:text-slate-500">
              <Package size={56} />
              <span className="text-sm">Sin foto</span>
            </div>
          )}
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white dark:hover:bg-slate-900 transition shadow">
            <X size={15} />
          </button>
          <div className="absolute bottom-3 left-3">
            <StockBadge status={status} />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-xs font-mono text-slate-400 dark:text-slate-400 mb-1">{item.sku}</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">{item.name}</h2>
            {item.category && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                <Layers size={12} /> {item.category}
                {item.color ? ` · ${item.color}` : ""}
              </p>
            )}
            {item.supplier && (
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">Proveedor: {item.supplier}</p>
            )}
          </div>

          {/* Price & stock grid */}
          <div className={`grid gap-3 mb-5 ${canEdit ? "grid-cols-3" : "grid-cols-1"}`}>
            <div className="bg-emerald-50 dark:bg-emerald-500/15 rounded-xl p-3 text-center">
              <p className="text-xs text-emerald-600 dark:text-emerald-300 font-medium mb-1 flex items-center justify-center gap-1">
                <Tag size={11} /> Precio venta
              </p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{fmtCurrency(item.salePrice)}</p>
            </div>
            {canEdit && (
              <>
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Costo</p>
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{fmtCurrency(item.unitCost)}</p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-500/15 rounded-xl p-3 text-center">
                  <p className="text-xs text-indigo-600 dark:text-indigo-300 font-medium mb-1">Margen</p>
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{margin}%</p>
                </div>
              </>
            )}
          </div>

          {/* Stock bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Stock actual</span>
              <span>{item.currentStock} / {item.maxStock} unidades</span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  status === "critical" ? "bg-red-500" :
                  status === "low"      ? "bg-amber-400" : "bg-emerald-500"
                }`}
                style={{ width: `${item.maxStock > 0 ? Math.min(100, (item.currentStock / item.maxStock) * 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-400 mt-1">
              <span>Mín: {item.minStock}</span>
              <span>Lead time: {item.leadTimeDays}d</span>
            </div>
          </div>

          {/* Price history chart */}
          {canEdit && item.priceHistory && item.priceHistory.length >= 2 && (() => {
            const chartData = [...item.priceHistory]
              .sort((a, b) => a.date.toMillis() - b.date.toMillis())
              .map((e) => ({
                date: e.date.toDate().toLocaleDateString("es-DO", { day: "2-digit", month: "short" }),
                Costo: e.unitCost,
                Precio: e.salePrice,
              }));
            return (
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <History size={11} /> Evolución de precios
                </p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(v: number) => [`$${v.toFixed(2)}`, ""]}
                      />
                      <Line type="monotone" dataKey="Costo"  stroke="#ef4444" strokeWidth={1.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Precio" stroke="#10b981" strokeWidth={1.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 justify-center mt-1">
                  <span className="flex items-center gap-1 text-xs text-red-500"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Costo</span>
                  <span className="flex items-center gap-1 text-xs text-emerald-600"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Precio venta</span>
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          {canEdit && (
            <div className="flex gap-2">
              <button onClick={() => { onAdjust(); onClose(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <SlidersHorizontal size={14} /> Ajustar stock
              </button>
              <button onClick={() => { onEdit(); onClose(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
                <Edit2 size={14} /> Editar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick adjust modal ───────────────────────────────────────────────────────

function QuickAdjustModal({ item, onClose, onDone }: {
  item: InventoryItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const [delta, setDelta] = useState(1);
  const [note,  setNote]  = useState("");
  const [type,  setType]  = useState<"purchase" | "adjustment" | "sale">("purchase");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || delta === 0) return;
    setSaving(true);
    const actualDelta = type === "sale" || (type === "adjustment" && delta < 0) ? -Math.abs(delta) : Math.abs(delta);
    const r = await adjustStock(workspaceId, item.id, actualDelta, note || "Ajuste manual", type);
    setSaving(false);
    if (r.ok) { toast.success(r.message); onDone(); onClose(); }
    else toast.error(r.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Ajuste rápido de stock</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{item.name} · Stock actual: <b>{item.currentStock}</b></p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de movimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "purchase", label: "Entrada", color: "emerald" },
                { v: "sale",     label: "Salida",  color: "red" },
                { v: "adjustment", label: "Ajuste", color: "amber" },
              ] as const).map(({ v, label, color }) => (
                <button key={v} type="button" onClick={() => setType(v)}
                  className={`py-2 rounded-lg text-sm font-medium border transition
                    ${type === v
                      ? color === "emerald" ? "bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300"
                        : color === "red"   ? "bg-red-50 border-red-400 text-red-700 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-300"
                        : "bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cantidad</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDelta(d => Math.max(1, d - 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <Minus size={14} />
              </button>
              <input type="number" value={delta} min={1}
                onChange={(e) => setDelta(Math.max(1, Number(e.target.value)))}
                className="flex-1 text-center border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button type="button" onClick={() => setDelta(d => d + 1)}
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <Plus size={14} />
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
              Nuevo stock estimado: <b className={
                type === "sale" ? "text-red-600 dark:text-red-400" : type === "purchase" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }>
                {type === "sale" ? Math.max(0, item.currentStock - delta)
                  : type === "purchase" ? item.currentStock + delta
                  : item.currentStock + delta}
              </b>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nota <span className="text-slate-400 dark:text-slate-400 font-normal">(opcional)</span></label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="ej. Recepción de proveedor, merma…"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
              {saving ? "Guardando…" : "Confirmar ajuste"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── QR Modal ────────────────────────────────────────────────────────────────

function QRModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, item.sku, { width: 200, margin: 2 });
  }, [item.sku]);

  function handlePrint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR ${item.sku}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}
      h2{margin:8px 0 4px}p{color:#666;margin:2px 0}</style></head>
      <body>
        <img src="${canvas.toDataURL()}" width="200" />
        <h2>${item.name}</h2>
        <p>SKU: ${item.sku}</p>
        <p>Stock: ${item.currentStock} · Precio: ${fmtCurrency(item.salePrice)}</p>
      </body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xs p-6 text-center">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Código QR</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"><X size={16} /></button>
        </div>
        <canvas ref={canvasRef} className="mx-auto rounded-xl" />
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-3">{item.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{item.sku}</p>
        <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">Stock: {item.currentStock} · {fmtCurrency(item.salePrice)}</p>
        <button onClick={handlePrint}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition">
          <Printer size={14} /> Imprimir etiqueta
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard panel ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<StockStatus, string> = {
  critical: "#ef4444",
  low:      "#f59e0b",
  ok:       "#10b981",
};

const CHART_COLORS = [
  "#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

function InventoryDashboard({ items, activeFilter, onFilter }: {
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

  const cTotal    = useCounter(items.length);
  const cUnits    = useCounter(totalUnits);
  const cCritical = useCounter(critical.length);
  const cLow      = useCounter(low.length);

  const byCategory = Object.entries(
    items.reduce<Record<string, { units: number; value: number; count: number }>>((acc, i) => {
      const cat = i.category || "Sin categoría";
      if (!acc[cat]) acc[cat] = { units: 0, value: 0, count: 0 };
      acc[cat].units += i.currentStock;
      acc[cat].value += i.currentStock * i.unitCost;
      acc[cat].count += 1;
      return acc;
    }, {})
  ).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.value - a.value);

  const pieData = [
    { name: "Óptimo",  value: ok.length,       color: "#10b981" },
    { name: "Bajo",    value: low.length,       color: "#f59e0b" },
    { name: "Crítico", value: critical.length,  color: "#ef4444" },
  ].filter((d) => d.value > 0);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total productos" value={fmt(cTotal, 0)} icon={Boxes} color="bg-indigo-500"
          sub={`${fmt(cUnits, 0)} unidades en stock`}
          active={activeFilter === "all"} onClick={() => onFilter("all")} />
        <StatCard label="Necesita reabasto" value={fmt(cLow + cCritical, 0)} icon={TrendingDown} color="bg-amber-500"
          sub={`${fmt(cCritical, 0)} crítico · ${fmt(cLow, 0)} bajo`}
          active={activeFilter === "low" || activeFilter === "critical"} onClick={() => onFilter("low")} />
        <StatCard label="Stock crítico" value={fmt(cCritical, 0)} icon={AlertTriangle} color="bg-red-500"
          sub={critical.length > 0 ? `${critical.map(i => i.name).slice(0,2).join(", ")}…` : "Todo en orden ✓"}
          active={activeFilter === "critical"} onClick={() => toggle("critical")} />
        <StatCard label="Stock bajo" value={fmt(cLow, 0)} icon={TrendingDown} color="bg-amber-500"
          sub={low.length > 0 ? "Reabastecer pronto" : "Sin alertas"}
          active={activeFilter === "low"} onClick={() => toggle("low")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top productos por valor en stock</h3>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-400 text-sm text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,.1)", fontSize: 12 }}
                  formatter={(v: number) => [`$${fmt(v)}`, "Valor"]} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {topProducts.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={16} className="text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Estado del stock</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-400 text-sm text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                  dataKey="value" paddingAngle={3}
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "none", fontSize: 12 }}
                  formatter={(v: number) => [`${v} productos`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-col gap-1.5 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Stock por categoría</h3>
        {byCategory.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-400 text-sm text-center py-4">Sin datos</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(({ name, units, value, count }, idx) => {
              const maxVal = byCategory[0].value;
              const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
              const isActive = activeFilter === name;
              return (
                <button key={name} onClick={() => toggle(name)}
                  className={`w-full text-left group transition-all rounded-xl p-2 -mx-2 ${isActive ? "bg-indigo-50 dark:bg-indigo-500/15" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium flex items-center gap-2 ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      {name}
                      <span className="text-slate-400 dark:text-slate-400 font-normal text-xs">({count} prod.)</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmt(units, 0)} u · {fmtCurrency(value)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: CHART_COLORS[idx % CHART_COLORS.length] }} />
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

// ─── Historial tab ────────────────────────────────────────────────────────────

function HistorialTab({ uid }: { uid: string }) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading]     = useState(true);
  const [days, setDays]           = useState(30);

  useEffect(() => {
    setLoading(true);
    listMovements(uid, days)
      .then(setMovements)
      .finally(() => setLoading(false));
  }, [uid, days]);

  const typeLabel: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    purchase:   { label: "Entrada",   icon: <ArrowUpCircle size={14} />,   color: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15" },
    sale:       { label: "Venta",     icon: <ArrowDownCircle size={14} />, color: "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/15" },
    adjustment: { label: "Ajuste",    icon: <SlidersHorizontal size={14} />, color: "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15" },
    production: { label: "Producción", icon: <Factory size={14} />,       color: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15" },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Historial de movimientos</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value={7}>Últimos 7 días</option>
          <option value={15}>Últimos 15 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={60}>Últimos 60 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-400">Cargando…</div>
      ) : movements.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-16 text-center shadow-sm">
          <History size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">No hay movimientos en este período</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                {["Tipo","Producto","SKU","Cantidad","Nota","Fecha"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const t = typeLabel[m.movementType] ?? typeLabel.adjustment;
                const date = m.createdAt?.toDate?.() ?? new Date();
                return (
                  <tr key={m.id} className="border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.color}`}>
                        {t.icon} {t.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{m.productName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{m.sku}</td>
                    <td className={`py-3 px-4 font-semibold ${m.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {m.quantity > 0 ? "+" : ""}{m.quantity}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{m.note || "—"}</td>
                    <td className="py-3 px-4 text-slate-400 dark:text-slate-400 text-xs whitespace-nowrap">
                      {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                      {" "}
                      {date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Órdenes de reabastecimiento ─────────────────────────────────────────────

const PO_STATUS: Record<PurchaseOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente: { label: "Pendiente", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",     icon: <Clock size={11} /> },
  recibida:  { label: "Recibida",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", icon: <CheckCircle2 size={11} /> },
  parcial:   { label: "Parcial",   color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",        icon: <PackageCheck size={11} /> },
  cancelada: { label: "Cancelada", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",           icon: <XCircle size={11} /> },
};

function OrdenesTab({ items, uid, canViewPO, canReceive }: { items: InventoryItem[]; uid: string; canViewPO: boolean; canReceive: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);

  function reloadOrders() {
    if (!canViewPO) { setOrders([]); setLoadingOrders(false); return; }
    setLoadingOrders(true);
    listPurchaseOrders(uid)
      .then(setOrders)
      .finally(() => setLoadingOrders(false));
  }

  useEffect(() => { reloadOrders(); }, [uid, canViewPO]); // eslint-disable-line react-hooks/exhaustive-deps

  const needRestock = items
    .filter((i) => i.currentStock <= i.minStock)
    .map((i) => ({
      ...i,
      status: getStockStatus(i),
      qtyNeeded: i.maxStock - i.currentStock,
      estimatedCost: (i.maxStock - i.currentStock) * i.unitCost,
    }))
    .sort((a, b) => a.currentStock - b.currentStock);

  const totalCost = needRestock.reduce((s, i) => s + i.estimatedCost, 0);

  // Active orders (pending or partial) that cover low-stock items
  const activeOrders = orders.filter((o) => o.status === "pendiente" || o.status === "parcial");
  const allOrders    = [...orders].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);

  function printNeedsList() {
    const rows = needRestock.map((i) =>
      `<tr><td>${esc(i.sku)}</td><td>${esc(i.name)}</td><td>${esc(i.supplier) || "—"}</td>
       <td style="text-align:center">${i.currentStock}</td>
       <td style="text-align:center">${i.qtyNeeded}</td>
       <td style="text-align:right">${fmtCurrency(i.unitCost)}</td>
       <td style="text-align:right">${fmtCurrency(i.estimatedCost)}</td></tr>`
    ).join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Necesidades de reabastecimiento</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#1e293b}
        h1{font-size:20px;margin-bottom:4px}p{color:#64748b;font-size:13px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:12px}
        td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
        tfoot td{font-weight:bold;background:#f8fafc}
      </style></head>
      <body>
        <h1>Necesidades de reabastecimiento</h1>
        <p>Generado el ${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}</p>
        <table>
          <thead><tr><th>SKU</th><th>Producto</th><th>Proveedor</th><th>Stock actual</th><th>A pedir</th><th>Costo unit.</th><th>Total est.</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="6">TOTAL ESTIMADO</td><td style="text-align:right">${fmtCurrency(totalCost)}</td></tr></tfoot>
        </table>
      </body></html>`);
    win.document.close();
    win.print();
  }

  function printPurchaseOrder(order: PurchaseOrder) {
    const rows = order.items.map((i) =>
      `<tr><td>${esc(i.sku)}</td><td>${esc(i.productName)}</td><td>${esc(i.category)}</td>
       <td style="text-align:center">${i.qtyOrdered}</td>
       <td style="text-align:center">${i.qtyReceived}</td>
       <td style="text-align:right">${fmtCurrency(i.unitCost)}</td>
       <td style="text-align:right">${fmtCurrency(i.total)}</td></tr>`
    ).join("");
    const statusMeta = PO_STATUS[order.status];
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Orden ${order.orderNumber}</title>
      <style>
        body{font-family:sans-serif;padding:28px;color:#1e293b;font-size:13px}
        h1{font-size:22px;margin:0}.header{display:flex;justify-content:space-between;margin-bottom:20px}
        .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${order.status==="recibida"?"#d1fae5":order.status==="cancelada"?"#fee2e2":order.status==="parcial"?"#dbeafe":"#fef3c7"};
          color:${order.status==="recibida"?"#065f46":order.status==="cancelada"?"#991b1b":order.status==="parcial"?"#1e40af":"#92400e"}}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
        .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px}
        .info-box p{margin:0;font-size:11px;color:#64748b}.info-box b{display:block;font-size:14px;color:#1e293b;margin-top:2px}
        table{width:100%;border-collapse:collapse}
        th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
        td{padding:8px 10px;border-bottom:1px solid #f1f5f9}
        .totals{margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
        .totals div{display:flex;gap:48px;font-size:13px}
        .grand{font-weight:700;font-size:15px;border-top:2px solid #e2e8f0;padding-top:8px;margin-top:4px}
      </style></head>
      <body>
        <div class="header">
          <div>
            <h1>Orden de Compra</h1>
            <p style="color:#64748b;margin:4px 0 8px">${order.orderNumber}</p>
            <span class="badge">${statusMeta.label}</span>
          </div>
          <div style="text-align:right">
            <p style="margin:0;font-size:11px;color:#64748b">Fecha creación</p>
            <p style="margin:0;font-weight:600">${order.createdAt?.toDate?.()?.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})??""}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#64748b">Fecha esperada</p>
            <p style="margin:0;font-weight:600">${order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})??""}</p>
          </div>
        </div>
        <div class="info">
          <div class="info-box"><p>Proveedor</p><b>${order.supplierName}</b>${order.supplierRnc?`<p style="margin-top:6px">RNC</p><b>${order.supplierRnc}</b>`:""}</div>
          <div class="info-box">${order.supplierPhone?`<p>Teléfono</p><b>${order.supplierPhone}</b>`:""}${order.supplierEmail?`<p style="margin-top:6px">Email</p><b>${order.supplierEmail}</b>`:""}</div>
        </div>
        <table>
          <thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Pedido</th><th>Recibido</th><th>Costo unit.</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span style="color:#64748b">Subtotal</span><span>${fmtCurrency(order.subtotal)}</span></div>
          <div><span style="color:#64748b">ITBIS 18%</span><span>${fmtCurrency(order.tax)}</span></div>
          <div class="grand"><span>TOTAL</span><span>${fmtCurrency(order.total)}</span></div>
        </div>
        ${order.note?`<p style="margin-top:16px;padding:10px;background:#f8fafc;border-radius:6px;color:#64748b;font-size:12px"><b>Nota:</b> ${order.note}</p>`:""}
      </body></html>`);
    win.document.close();
    win.print();
  }

  function goToCreateOrder() {
    // Pre-load low stock items into localStorage so compras page picks them up
    const preload = needRestock.map((i) => ({
      inventoryId: i.id, sku: i.sku, productName: i.name,
      category: i.category, qtyOrdered: i.qtyNeeded, qtyReceived: 0,
      unitCost: i.unitCost, total: i.qtyNeeded * i.unitCost,
    }));
    localStorage.setItem("compras_preload", JSON.stringify(preload));
    router.push("/compras");
  }

  return (
    <div className="space-y-6">
      {receivingOrder && (
        <ReceiveOrderModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onDone={() => { setReceivingOrder(null); reloadOrders(); }}
        />
      )}
      {/* ── Necesidades actuales ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Necesidades de reabastecimiento</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Productos en o por debajo del stock mínimo</p>
          </div>
          <div className="flex gap-2">
            {needRestock.length > 0 && (
              <>
                <button onClick={printNeedsList}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  <Printer size={14} /> Imprimir lista
                </button>
                <button onClick={goToCreateOrder}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition">
                  <ShoppingCart size={14} /> Crear orden de compra
                </button>
              </>
            )}
          </div>
        </div>

        {needRestock.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center shadow-sm">
            <ShoppingCart size={40} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-slate-700 dark:text-slate-200 font-medium">Todo en orden ✓</p>
            <p className="text-slate-400 dark:text-slate-400 text-sm mt-1">Ningún producto está por debajo del stock mínimo</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
                <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Productos a reabastecer</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{needRestock.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
                <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Unidades a pedir</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{needRestock.reduce((s, i) => s + i.qtyNeeded, 0)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
                <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Costo estimado total</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalCost)}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                    {["SKU","Producto","Proveedor","Stock actual","Mínimo","A pedir","Costo unit.","Total est.","Estado"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {needRestock.map((item) => (
                    <tr key={item.id} className="border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</td>
                      <td className="py-3 px-4 font-medium dark:text-slate-200">{item.name}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{item.supplier || "—"}</td>
                      <td className="py-3 px-4 font-semibold text-red-600 dark:text-red-400">{item.currentStock}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{item.minStock}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{item.qtyNeeded}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{fmtCurrency(item.unitCost)}</td>
                      <td className="py-3 px-4 font-semibold dark:text-slate-200">{fmtCurrency(item.estimatedCost)}</td>
                      <td className="py-3 px-4"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Órdenes de compra registradas ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Órdenes de compra registradas
            {activeOrders.length > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 font-medium">
                {activeOrders.length} activa{activeOrders.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <button onClick={() => router.push("/compras")}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition">
            Ver todas <ExternalLink size={12} />
          </button>
        </div>

        {loadingOrders ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-400 text-sm">Cargando órdenes…</div>
        ) : allOrders.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-100 dark:border-slate-700 p-8 text-center text-slate-400 dark:text-slate-400 text-sm">
            No hay órdenes de compra registradas aún
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                  {["N° Orden","Proveedor","RNC","Productos","Total","Fecha esperada","Estado","Acciones"].map((h) => (
                    <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allOrders.map((order) => {
                  const sm = PO_STATUS[order.status];
                  return (
                    <tr key={order.id} className="border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">{order.orderNumber}</td>
                      <td className="py-3 px-4 font-medium dark:text-slate-200">{order.supplierName}</td>
                      <td className="py-3 px-4 text-slate-400 dark:text-slate-400 font-mono text-xs">{order.supplierRnc || "—"}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{order.items.length} prod.</td>
                      <td className="py-3 px-4 font-semibold dark:text-slate-200">{fmtCurrency(order.total)}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {order.expectedDate?.toDate?.()?.toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}) ?? "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${sm.color}`}>
                          {sm.icon} {sm.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {canReceive && (order.status === "pendiente" || order.status === "parcial") && (
                            <button
                              onClick={() => setReceivingOrder(order)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium"
                              title="Recepcionar mercancía"
                            >
                              <PackageCheck size={13} /> Recepcionar
                            </button>
                          )}
                          <button onClick={() => printPurchaseOrder(order)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 rounded-lg transition" title="Imprimir">
                            <Printer size={14} />
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
  );
}

// ─── ConteoTab ────────────────────────────────────────────────────────────────

const DAYS_BETWEEN_CONTEOS = 14;

function ConteoTab({ items, uid, onDone }: {
  items: InventoryItem[];
  uid: string;
  onDone: () => void;
}) {
  const [lastConteo,    setLastConteo]    = useState<ConteoRecord | null | undefined>(undefined);
  const [history,       setHistory]       = useState<ConteoRecord[]>([]);
  const [loadingInfo,   setLoadingInfo]   = useState(true);
  const [mode,          setMode]          = useState<"info" | "counting">("info");
  const [counts,        setCounts]        = useState<Record<string, number>>({});
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    Promise.all([getLastConteo(uid), getRecentConteos(uid)])
      .then(([last, hist]) => { setLastConteo(last); setHistory(hist); })
      .finally(() => setLoadingInfo(false));
  }, [uid]);

  const daysSinceLast = lastConteo
    ? Math.floor((Date.now() - lastConteo.createdAt.toDate().getTime()) / 86_400_000)
    : null;
  const needsConteo = daysSinceLast === null || daysSinceLast >= DAYS_BETWEEN_CONTEOS;

  function startCounting() {
    const initial: Record<string, number> = {};
    items.forEach((i) => { initial[i.id] = i.currentStock; });
    setCounts(initial);
    setMode("counting");
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const conteoItems: ConteoItem[] = items.map((i) => ({
        inventoryId: i.id,
        sku:         i.sku,
        productName: i.name,
        systemQty:   i.currentStock,
        countedQty:  counts[i.id] ?? i.currentStock,
        diff:        (counts[i.id] ?? i.currentStock) - i.currentStock,
      }));
      await submitConteo(uid, conteoItems);
      toast.success("Conteo físico registrado y stock actualizado");
      await Promise.all([getLastConteo(uid), getRecentConteos(uid)])
        .then(([last, hist]) => { setLastConteo(last); setHistory(hist); });
      setMode("info");
      onDone();
    } catch {
      toast.error("Error al guardar el conteo");
    } finally {
      setSaving(false);
    }
  }

  const diffs = items.filter((i) => (counts[i.id] ?? i.currentStock) !== i.currentStock);

  if (loadingInfo) {
    return <div className="text-center py-12 text-slate-400 dark:text-slate-400 text-sm">Cargando…</div>;
  }

  if (mode === "counting") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Conteo físico en progreso</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ingresa las cantidades reales que tienes en almacén</p>
          </div>
          <button onClick={() => setMode("info")}
            className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            Cancelar
          </button>
        </div>

        {diffs.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle size={13} />
            {diffs.length} producto{diffs.length !== 1 ? "s" : ""} con diferencia respecto al sistema
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase">
                {["Producto", "SKU", "Sistema", "Contado", "Diferencia"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {items.map((item) => {
                const counted = counts[item.id] ?? item.currentStock;
                const diff    = counted - item.currentStock;
                return (
                  <tr key={item.id} className={diff !== 0 ? "bg-amber-50/50 dark:bg-amber-500/10" : ""}>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{item.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-400">{item.sku}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{item.currentStock}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0}
                        value={counted}
                        onChange={(e) => setCounts((p) => ({ ...p, [item.id]: Math.max(0, Number(e.target.value)) }))}
                        className="w-20 text-center border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-slate-300 dark:text-slate-600"}`}>
                      {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando…</>
            : `Confirmar conteo${diffs.length > 0 ? ` (${diffs.length} ajuste${diffs.length !== 1 ? "s" : ""})` : " (sin cambios)"}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className={`rounded-2xl border p-5 ${needsConteo ? "bg-amber-50 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-bold text-base ${needsConteo ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
              {lastConteo === null ? "Sin conteos registrados" :
               needsConteo ? `Conteo recomendado (hace ${daysSinceLast} días)` :
               `Al día — último hace ${daysSinceLast} día${daysSinceLast !== 1 ? "s" : ""}`}
            </p>
            <p className={`text-xs mt-1 ${needsConteo ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {!lastConteo ? "Se recomienda hacer un conteo físico cada 2 semanas" :
               `Último conteo: ${lastConteo.createdAt.toDate().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })} · ${lastConteo.adjustedItems} ajuste${lastConteo.adjustedItems !== 1 ? "s" : ""} aplicado${lastConteo.adjustedItems !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={startCounting}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              needsConteo
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            Iniciar conteo
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Productos a contar</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{items.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Conteos realizados</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{history.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs text-slate-400 dark:text-slate-400 mb-1">Próximo conteo en</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {daysSinceLast === null ? "Ahora"
              : Math.max(0, DAYS_BETWEEN_CONTEOS - daysSinceLast) === 0
              ? "Hoy"
              : `${Math.max(0, DAYS_BETWEEN_CONTEOS - daysSinceLast)}d`}
          </p>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Historial de conteos</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400 uppercase">
                {["Fecha", "Productos", "Ajustes aplicados"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {history.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {c.createdAt.toDate().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 dark:text-slate-300">{c.totalProducts}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${c.adjustedItems > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {c.adjustedItems === 0 ? "Sin diferencias" : `${c.adjustedItems} producto${c.adjustedItems !== 1 ? "s" : ""}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InventarioPage() {
  const { user } = useAuth();
  const { workspaceId, can } = useRole();
  const canEditInv = can("inventario").canEdit;
  const [tab,          setTab]          = useState<Tab>(canEditInv ? "dashboard" : "list");
  const [items,        setItems]        = useState<InventoryItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [form,           setForm]           = useState(EMPTY);
  const [formErrors,     setFormErrors]     = useState<Record<string, string>>({});
  const [editing,        setEditing]        = useState<InventoryItem | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  // Advanced filters
  const [sortKey,      setSortKey]      = useState<SortKey>("name");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page,         setPage]         = useState(1);
  const PAGE_SIZE = 50;

  // Modals
  const [adjustItem,   setAdjustItem]   = useState<InventoryItem | null>(null);
  const [qrItem,       setQrItem]       = useState<InventoryItem | null>(null);
  const [detailItem,   setDetailItem]   = useState<InventoryItem | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<InventoryItem | null>(null);

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [inv, sups] = await Promise.all([listInventory(workspaceId), listSuppliers(workspaceId)]);
      setItems(inv);
      setSuppliers(sups);
    }
    catch { toast.error("Error al cargar inventario"); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, supplierFilter, activeFilter]);

  function setF(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: ["currentStock","minStock","maxStock","unitCost","salePrice","leadTimeDays"].includes(k)
        ? Number(e.target.value) : e.target.value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const result = inventorySchema.safeParse(form);
    if (!result.success) { setFormErrors(Object.fromEntries(result.error.issues.map((e) => [e.path.join("."), e.message]))); toast.error("Corrige los errores del formulario"); return; }
    setFormErrors({});
    setSaving(true);
    const r = await addInventoryItem(workspaceId, result.data);
    setSaving(false);
    if (r.ok) { toast.success(r.message); setForm(EMPTY); await load(); setTab("list"); }
    else toast.error(r.message);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !user) return;
    const result = inventorySchema.safeParse(form);
    if (!result.success) { setFormErrors(Object.fromEntries(result.error.issues.map((e) => [e.path.join("."), e.message]))); toast.error("Corrige los errores del formulario"); return; }
    setFormErrors({});
    setSaving(true);
    const r = await updateInventoryItem(workspaceId, editing.id, result.data);
    setSaving(false);
    if (r.ok) { toast.success(r.message); setEditing(null); await load(); setTab("list"); }
    else toast.error(r.message);
  }

  function handleDelete(item: InventoryItem) {
    setConfirmDeleteItem(item);
  }

  async function doDeleteItem() {
    if (!confirmDeleteItem || !user) return;
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    const r = await deleteInventoryItem(workspaceId, item.id);
    if (r.ok) { toast.success(r.message); await load(); }
    else toast.error(r.message);
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown size={12} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-brand-500" /> : <ChevronDown size={12} className="text-brand-500" />;
  }

  function downloadCSVTemplate() {
    const headers = ["producto", "tipo", "color", "proveedor", "stock", "stock_minimo", "stock_maximo", "costo", "precio_venta", "leadtime_dias"];
    const example = ["Producto Ejemplo", "Categoria", "Rojo", "Proveedor S.A.", "100", "10", "200", "50.00", "80.00", "7"];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = "plantilla_inventario.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  function exportCSV() {
    // Costo se omite para roles de solo-lectura (Ventas) — mismo criterio que
    // la tabla en pantalla (canEditInv), para no filtrar costos/márgenes por
    // una puerta trasera del export que la UI sí protege.
    const rows = items.map(({ sku, name, category, color, currentStock, minStock, maxStock, unitCost, salePrice, supplier }) => {
      const row: Record<string, string | number> = {
        sku, producto: name, tipo: category, color,
        stock: currentStock, stock_minimo: minStock, stock_maximo: maxStock,
      };
      if (canEditInv) row.costo = unitCost;
      row.precio_venta = salePrice;
      row.proveedor = supplier;
      return row;
    });
    const csv = "﻿" + Papa.unparse(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `inventario_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportPDF() {
    // Igual que exportCSV: el costo (y el valor de inventario a costo, más
    // abajo) solo va si el rol puede editar Inventario — Ventas es read-only
    // y no debe ver costos/márgenes ni siquiera vía el PDF.
    const rows = filtered.map((i) =>
      `<tr>
        <td>${esc(i.sku)}</td><td>${esc(i.name)}</td><td>${esc(i.category)}</td>
        <td style="text-align:center">${i.currentStock}</td>
        <td style="text-align:center">${i.minStock}</td>
        ${canEditInv ? `<td style="text-align:right">${fmtCurrency(i.unitCost)}</td>` : ""}
        <td style="text-align:right">${fmtCurrency(i.salePrice)}</td>
        <td style="text-align:center">${getStockStatus(i) === "critical" ? "🔴 Crítico" : getStockStatus(i) === "low" ? "🟡 Bajo" : "🟢 Óptimo"}</td>
      </tr>`
    ).join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Inventario</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#1e293b;font-size:13px}
        h1{font-size:20px;margin-bottom:4px}p{color:#64748b;margin:0 0 16px}
        table{width:100%;border-collapse:collapse}
        th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        td{padding:8px 10px;border-bottom:1px solid #f1f5f9}
        .kpi{display:flex;gap:24px;margin-bottom:16px}
        .kpi div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px}
        .kpi p{font-size:11px;margin:0 0 2px}.kpi b{font-size:18px}
      </style></head>
      <body>
        <h1>Reporte de Inventario</h1>
        <p>Generado el ${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}</p>
        <div class="kpi">
          <div><p>Total productos</p><b>${items.length}</b></div>
          ${canEditInv ? `<div><p>Valor inventario</p><b>${fmtCurrency(items.reduce((s,i)=>s+i.currentStock*i.unitCost,0))}</b></div>` : ""}
          <div><p>Stock crítico</p><b>${items.filter(i=>getStockStatus(i)==="critical").length}</b></div>
        </div>
        <table>
          <thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Stock</th><th>Mín.</th>${canEditInv ? "<th>Costo</th>" : ""}<th>P.Venta</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`);
    win.document.close();
    win.print();
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
        })).filter((r) => {
          if (!r.name || !r.category) return false;
          if (r.currentStock < 0 || r.minStock < 0 || r.maxStock < 1) return false;
          if (r.unitCost < 0 || r.salePrice < 0) return false;
          if (r.maxStock < r.minStock) return false;
          return true;
        });
        if (!rows.length) { toast.error("No se encontraron filas válidas"); return; }
        const { imported, errors } = await bulkAddInventory(workspaceId, rows);
        toast.success(`${imported} productos importados`);
        if (errors.length) toast.error(`${errors.length} errores`);
        await load(); setTab("list");
      },
    });
    e.target.value = "";
  }

  const supplierFilterOptions = ["all", ...Array.from(new Set(items.map(i => i.supplier).filter(Boolean)))];

  const filtered = items
    .filter((i) => {
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase());
      const status = getStockStatus(i);
      const matchFilter =
        activeFilter === "all"      ? true :
        activeFilter === "critical" ? status === "critical" :
        activeFilter === "low"      ? status === "low" :
        activeFilter === "ok"       ? status === "ok" :
        i.category === activeFilter;
      const matchSupplier = supplierFilter === "all" || i.supplier === supplierFilter;
      return matchSearch && matchFilter && matchSupplier;
    })
    .sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const TABS: { key: Tab; label: string }[] = canEditInv ? [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "list",      label: `📋 Productos (${items.length})` },
    { key: "add",       label: editing ? "✏️ Editar" : "➕ Agregar" },
    { key: "historial", label: "📜 Historial" },
    { key: "ordenes",   label: `🛒 Reabastecer${items.filter(i=>getStockStatus(i)!=="ok").length > 0 ? ` (${items.filter(i=>getStockStatus(i)!=="ok").length})` : ""}` },
    { key: "conteo",    label: "📦 Conteo físico" },
  ] : [
    { key: "list", label: `📋 Productos (${items.length})` },
  ];

  const sortableCols: { key: SortKey; label: string }[] = [
    { key: "name", label: "Producto" },
    { key: "category", label: "Tipo" },
    { key: "supplier", label: "Proveedor" },
    { key: "currentStock", label: "Stock" },
    ...(canEditInv ? [{ key: "unitCost" as SortKey, label: "Costo" }] : []),
    { key: "salePrice", label: "P.Venta" },
  ];

  if (loading) return <FullPageSpinner />;

  return (
    <div>
      {detailItem && (
        <ProductDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => { startEdit(detailItem); }}
          onAdjust={() => setAdjustItem(detailItem)}
          canEdit={canEditInv}
        />
      )}
      {adjustItem && (
        <QuickAdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onDone={load} />
      )}
      {qrItem && (
        <QRModal item={qrItem} onClose={() => setQrItem(null)} />
      )}
      <ConfirmModal
        isOpen={!!confirmDeleteItem}
        title="Eliminar producto"
        description={`¿Estás seguro de que deseas eliminar "${confirmDeleteItem?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={doDeleteItem}
        onCancel={() => setConfirmDeleteItem(null)}
      />

      <PageHeader
        title="Inventario"
        subtitle="Gestiona tus productos y niveles de stock"
        action={
          <div className="flex gap-2 flex-wrap">
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <Download size={15} /> CSV
            </button>
            <button onClick={exportPDF}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <Printer size={15} /> PDF
            </button>
            {canEditInv && (
              <>
                <button onClick={downloadCSVTemplate}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  title="Descargar plantilla CSV para importación masiva">
                  <FileText size={15} /> Plantilla
                </button>
                <label className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                  <Upload size={15} /> Importar CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
                </label>
                <button onClick={() => { setEditing(null); setForm(EMPTY); setTab("add"); }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition font-medium">
                  <Plus size={15} /> Agregar
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-6 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); if (t.key !== "add") { setEditing(null); setForm(EMPTY); } }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${tab === t.key ? "bg-white dark:bg-slate-700 shadow-sm text-brand-600 dark:text-brand-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && (
        items.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <EmptyState icon={Package} title="Sin productos aún" description="Agrega tu primer producto para ver el dashboard con estadísticas de stock, valor de inventario y alertas automáticas." action={canEditInv ? { label: "Agregar primer producto", onClick: () => setTab("add") } : undefined} />
          </div>
        ) : (
          <InventoryDashboard items={items} activeFilter={activeFilter}
            onFilter={(f) => { setActiveFilter(f); setTab("list"); }} />
        )
      )}

      {/* ── Lista ── */}
      {tab === "list" && (
        <div>
          {activeFilter !== "all" && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">Filtrando por:</span>
              <span className="flex items-center gap-1.5 px-3 py-1 bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 text-xs font-medium rounded-full">
                {activeFilter === "critical" ? "🔴 Stock crítico" :
                 activeFilter === "low"      ? "🟡 Stock bajo" :
                 activeFilter === "ok"       ? "🟢 Óptimo" : `📦 ${activeFilter}`}
                <button onClick={() => setActiveFilter("all")}><X size={12} /></button>
              </span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Filters row */}
            <div className="flex flex-wrap gap-3 p-4 border-b border-slate-100 dark:border-slate-700">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, SKU o categoría…"
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {supplierFilterOptions.length > 1 && (
                <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="all">Todos los proveedores</option>
                  {supplierFilterOptions.filter(s => s !== "all").map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-400 ml-auto">
                <SlidersHorizontal size={12} /> {filtered.length} resultados
              </span>
            </div>

            {filtered.length === 0 ? (
              items.length === 0
                ? <EmptyState icon={Package} title="Sin productos" description="Tu inventario está vacío." action={canEditInv ? { label: "Agregar producto", onClick: () => setTab("add") } : undefined} secondaryAction={canEditInv ? { label: "Importar CSV", onClick: () => { const el = document.getElementById("csv-import"); el?.click(); } } : undefined} />
                : <EmptyState icon={Package} title="Sin resultados" description="Ningún producto coincide con los filtros actuales." action={{ label: "Limpiar filtros", onClick: () => { setSearch(""); setActiveFilter("all"); } }} />
            ) : (
              <>
                {/* Mobile cards */}
                <div className="block sm:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                  {paginated.map((item) => {
                    const status = getStockStatus(item);
                    const pct = item.maxStock > 0 ? Math.min(100, (item.currentStock / item.maxStock) * 100) : 0;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <button onClick={() => setDetailItem(item)} className="flex-shrink-0">
                          <ProductThumb url={item.imageUrl} name={item.name} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <button onClick={() => setDetailItem(item)} className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate w-full text-left">
                            {item.name}
                          </button>
                          <p className="text-xs text-slate-400 dark:text-slate-400 font-mono">{item.sku} · {item.category}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {canEditInv && (
                              <button onClick={() => setAdjustItem(item)}
                                className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 transition text-slate-400 dark:text-slate-400">
                                <Minus size={10} />
                              </button>
                            )}
                            <div>
                              <span className="text-sm font-bold dark:text-slate-100">{item.currentStock}</span>
                              <div className="w-12 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                                <div className={status === "critical" ? "bg-red-500" : status === "low" ? "bg-amber-400" : "bg-emerald-500"}
                                  style={{ width: `${pct}%`, height: "100%", borderRadius: 9999 }} />
                              </div>
                            </div>
                            {canEditInv && (
                              <button onClick={() => setAdjustItem(item)}
                                className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/15 transition text-slate-400 dark:text-slate-400">
                                <Plus size={10} />
                              </button>
                            )}
                            <StockBadge status={status} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(item.salePrice)}</p>
                          {canEditInv && <p className="text-xs text-slate-400 dark:text-slate-400">costo {fmtCurrency(item.unitCost)}</p>}
                          <div className="flex gap-1 mt-1.5 justify-end">
                            <button onClick={() => setQrItem(item)}
                              className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition">
                              <QrCode size={13} />
                            </button>
                            {canEditInv && (
                              <>
                                <button onClick={() => startEdit(item)}
                                  className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 rounded-lg transition">
                                  <Edit2 size={13} />
                                </button>
                                <AdminButton onClick={() => handleDelete(item)}
                                  className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition">
                                  <Trash2 size={13} />
                                </AdminButton>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left py-3 px-4 font-medium">📷</th>
                        <th className="text-left py-3 px-4 font-medium">SKU</th>
                        {sortableCols.map(({ key, label }) => (
                          <th key={key}
                            className="text-left py-3 px-4 font-medium cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 whitespace-nowrap select-none"
                            onClick={() => toggleSort(key)}>
                            <span className="flex items-center gap-1">{label} <SortIcon k={key} /></span>
                          </th>
                        ))}
                        <th className="text-left py-3 px-4 font-medium">Mín/Máx</th>
                        <th className="text-left py-3 px-4 font-medium">Estado</th>
                        <th className="text-left py-3 px-4 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((item) => {
                        const status = getStockStatus(item);
                        const pct = item.maxStock > 0 ? Math.min(100, (item.currentStock / item.maxStock) * 100) : 0;
                        return (
                          <tr key={item.id} className="border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="py-3 px-4">
                              <button onClick={() => setDetailItem(item)} className="hover:opacity-80 transition">
                                <ProductThumb url={item.imageUrl} name={item.name} />
                              </button>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</td>
                            <td className="py-3 px-4">
                              <button onClick={() => setDetailItem(item)}
                                className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 transition text-left flex items-center gap-1 group">
                                {item.name}
                                <Eye size={12} className="opacity-0 group-hover:opacity-100 transition text-brand-400" />
                              </button>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{item.category}</td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{item.supplier || "—"}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {canEditInv && (
                                  <button onClick={() => setAdjustItem(item)}
                                    className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:border-red-500/40 transition text-slate-400 dark:text-slate-400">
                                    <Minus size={11} />
                                  </button>
                                )}
                                <div>
                                  <span className="font-semibold dark:text-slate-100">{item.currentStock}</span>
                                  <div className="w-14 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                                    <div className={status === "critical" ? "bg-red-500" : status === "low" ? "bg-amber-400" : "bg-emerald-500"}
                                      style={{ width: `${pct}%`, height: "100%", borderRadius: 9999 }} />
                                  </div>
                                </div>
                                {canEditInv && (
                                  <button onClick={() => setAdjustItem(item)}
                                    className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 dark:hover:bg-emerald-500/15 dark:hover:border-emerald-500/40 transition text-slate-400 dark:text-slate-400">
                                    <Plus size={11} />
                                  </button>
                                )}
                              </div>
                            </td>
                            {canEditInv && <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{fmtCurrency(item.unitCost)}</td>}
                            <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 font-medium">{fmtCurrency(item.salePrice)}</td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{item.minStock} / {item.maxStock}</td>
                            <td className="py-3 px-4"><StockBadge status={status} /></td>
                            <td className="py-3 px-4">
                              <div className="flex gap-1">
                                <button onClick={() => setQrItem(item)}
                                  className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-500/15 rounded-lg transition" title="Ver QR">
                                  <QrCode size={14} />
                                </button>
                                {canEditInv && (
                                  <>
                                    <button onClick={() => startEdit(item)}
                                      className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-500/15 rounded-lg transition" title="Editar">
                                      <Edit2 size={14} />
                                    </button>
                                    <AdminButton onClick={() => handleDelete(item)}
                                      className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/15 rounded-lg transition" title="Eliminar">
                                      <Trash2 size={14} />
                                    </AdminButton>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-400 dark:text-slate-400">
                  Página {page} de {totalPages} · {filtered.length} productos
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition">
                    ← Anterior
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = page <= 3 ? i + 1 : page - 2 + i;
                    if (p < 1 || p > totalPages) return null;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-8 h-8 text-xs rounded-lg border transition ${p === page ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition">
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Agregar / Editar ── */}
      {tab === "add" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-semibold mb-5 dark:text-slate-100">{editing ? "Editar producto" : "Registrar nuevo producto"}</h2>
          <form onSubmit={editing ? handleUpdate : handleAdd} className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Nombre del producto *", key: "name" as const,     placeholder: "ej. Camiseta manga corta" },
                { label: "Tipo / Categoría *",    key: "category" as const, placeholder: "ej. Ropa, Electrónico" },
                { label: "Color", key: "color" as const, placeholder: "ej. Rojo, Azul" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                  <input value={String(form[key])} onChange={setF(key)} placeholder={placeholder}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 ${formErrors[key] ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors[key] && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{formErrors[key]}</p>}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Proveedor</label>
                {suppliers.length > 0 ? (
                  <select value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Sin proveedor —</option>
                    {suppliers.filter(s => s.active).map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={form.supplier} onChange={setF("supplier")} placeholder="Nombre del proveedor"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                )}
              </div>
              {[
                { label: "Stock inicial",       key: "currentStock" as const, min: 0 },
                { label: "Stock mínimo",        key: "minStock" as const,     min: 0 },
                { label: "Stock máximo",        key: "maxStock" as const,     min: 0 },
                { label: "Días de lead time",   key: "leadTimeDays" as const, min: 1 },
                { label: "Costo unitario ($)",  key: "unitCost" as const,     min: 0, step: "0.01" },
                { label: "Precio de venta ($)", key: "salePrice" as const,    min: 0, step: "0.01" },
              ].map(({ label, key, min, step }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                  <input type="number" value={Number(form[key])} onChange={setF(key)} min={min} step={step}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 ${formErrors[key] ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`} />
                  {formErrors[key] && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{formErrors[key]}</p>}
                </div>
              ))}
            </div>
            <PhotoPicker current={form.imageUrl ?? ""}
              onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))}
              onUploading={setImageUploading} />

            {/* Price history (only in edit mode) */}
            {editing && editing.priceHistory && editing.priceHistory.length > 0 && (
              <details className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-700 transition list-none">
                  <History size={14} className="text-slate-400 dark:text-slate-400" />
                  Historial de precios ({editing.priceHistory.length})
                  <ChevronDown size={14} className="ml-auto text-slate-400 dark:text-slate-400" />
                </summary>
                <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {[...editing.priceHistory].reverse().map((entry, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{entry.date.toDate().toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      <div className="flex gap-4">
                        <span className="text-slate-600 dark:text-slate-400">Costo: <strong className="text-slate-800 dark:text-slate-200">${entry.unitCost.toFixed(2)}</strong></span>
                        <span className="text-slate-600 dark:text-slate-400">Precio: <strong className="text-emerald-700 dark:text-emerald-400">${entry.salePrice.toFixed(2)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving || imageUploading}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
                {imageUploading ? "Subiendo foto…" : saving ? "Guardando…" : (editing ? "Guardar cambios" : "Agregar al inventario")}
              </button>
              <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); setTab("list"); }}
                className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Historial ── */}
      {tab === "historial" && user && <HistorialTab uid={workspaceId} />}

      {/* ── Órdenes ── */}
      {tab === "ordenes" && user && (
        <OrdenesTab items={items} uid={workspaceId}
          canViewPO={can("compras").canView || can("recepciones").canView}
          canReceive={can("recepciones").canEdit} />
      )}

      {/* ── Conteo físico ── */}
      {tab === "conteo" && user && <ConteoTab items={items} uid={workspaceId} onDone={load} />}
    </div>
  );
}
