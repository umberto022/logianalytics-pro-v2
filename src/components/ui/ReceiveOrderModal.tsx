"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X, Camera, Image as ImageIcon, QrCode, Hash,
  ChevronDown, ChevronUp, CheckCircle2, Package,
  Minus, Plus, ScanLine, Barcode,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { receivePurchaseOrder } from "@/lib/firestore/purchases";
import { fmtCurrency } from "@/lib/utils";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types";

const CLOUDINARY_CLOUD  = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME  ?? "").trim();
const CLOUDINARY_PRESET = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "").trim();

// ─── Photo uploader (inline, no modal) ───────────────────────────────────────

function InlinePhotoUpload({ value, onChange }: {
  value: string;
  onChange: (url: string) => void;
}) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode,      setMode]      = useState<"idle" | "camera">("idle");
  const [uploading, setUploading] = useState(false);
  const [imgErr,    setImgErr]    = useState(false);

  async function uploadBlob(blob: Blob, name: string) {
    if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
      toast.error("Cloudinary no configurado"); return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", blob, name);
      form.append("upload_preset", CLOUDINARY_PRESET);
      form.append("folder", "receipt-photos");
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
        method: "POST", body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
      onChange(data.secure_url);
      setImgErr(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { await uploadBlob(f, f.name); e.target.value = ""; }
  }

  async function startCamera() {
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { toast.error("No se pudo acceder a la cámara"); setMode("idle"); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setMode("idle");
  }

  async function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    canvasRef.current.width  = v.videoWidth;
    canvasRef.current.height = v.videoHeight;
    canvasRef.current.getContext("2d")!.drawImage(v, 0, 0);
    stopCamera();
    canvasRef.current.toBlob(async (blob) => {
      if (blob) await uploadBlob(blob, "recepcion.jpg");
    }, "image/jpeg", 0.85);
  }

  if (mode === "camera") {
    return (
      <div className="rounded-lg overflow-hidden bg-black relative">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="w-full max-h-40 object-cover" autoPlay playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
          <button type="button" onClick={capture}
            className="px-4 py-1.5 bg-white text-slate-900 rounded-full text-xs font-semibold shadow">
            📸 Capturar
          </button>
          <button type="button" onClick={stopCamera}
            className="px-3 py-1.5 bg-red-500 text-white rounded-full text-xs font-semibold shadow">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (uploading) {
    return <p className="text-xs text-brand-600 animate-pulse py-1">Subiendo foto…</p>;
  }

  if (value && !imgErr) {
    return (
      <div className="relative w-20 h-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="recepción" className="w-20 h-20 object-cover rounded-lg border border-slate-200"
          onError={() => setImgErr(true)} />
        <button type="button" onClick={() => onChange("")}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
          <X size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button type="button" onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600">
        <ImageIcon size={12} /> Subir foto
      </button>
      <button type="button" onClick={startCamera}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600">
        <Camera size={12} /> Cámara
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── QR / Barcode scanner ─────────────────────────────────────────────────────

function QrScannerButton({ onScan }: { onScan: (code: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const divId = useRef(`qr-${Math.random().toString(36).slice(2)}`);

  async function startScan() {
    setScanning(true);
    // dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import("html5-qrcode");
    // wait a tick for the div to be in the DOM
    await new Promise(r => setTimeout(r, 80));
    const scanner = new Html5Qrcode(divId.current);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 200, height: 120 } },
        (decoded) => {
          onScan(decoded);
          stopScan();
        },
        undefined
      );
    } catch {
      toast.error("No se pudo iniciar el escáner");
      setScanning(false);
    }
  }

  async function stopScan() {
    try { await scannerRef.current?.stop(); } catch { /* ignore */ }
    scannerRef.current = null;
    setScanning(false);
  }

  if (scanning) {
    return (
      <div className="space-y-2">
        <div id={divId.current} className="rounded-lg overflow-hidden" />
        <button type="button" onClick={stopScan}
          className="w-full py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
          Cancelar escáner
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button type="button" onClick={startScan}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition">
        <QrCode size={12} /> Escanear QR
      </button>
      <button type="button" onClick={startScan}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">
        <Barcode size={12} /> Código de barras
      </button>
    </div>
  );
}

// ─── Item reception card ──────────────────────────────────────────────────────

interface ItemState {
  inventoryId: string;
  sku: string;
  productName: string;
  category: string;
  qtyOrdered: number;
  qtyAlreadyReceived: number;
  qtyToReceive: number;
  unitCost: number;
  total: number;
  serialNumber: string;
  batchCode: string;
  receiptPhotoUrl: string;
}

function ItemCard({
  item, idx, onChange, orderNumber,
}: {
  item: ItemState;
  idx: number;
  onChange: (idx: number, patch: Partial<ItemState>) => void;
  orderNumber: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const maxQty = item.qtyOrdered - item.qtyAlreadyReceived;
  const done   = item.qtyToReceive >= maxQty && maxQty > 0;

  return (
    <div className={`rounded-xl border transition-all ${done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}>
      {/* Card header */}
      <button type="button" onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
          {done ? <CheckCircle2 size={16} /> : <Package size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{item.productName}</p>
          <p className="text-xs text-slate-400 font-mono">{item.sku} · Pedido: {item.qtyOrdered} · Recibido prev: {item.qtyAlreadyReceived}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold ${done ? "text-emerald-600" : "text-slate-700"}`}>
            {item.qtyToReceive} / {maxQty}
          </p>
          <p className="text-xs text-slate-400">a recibir</p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
          {/* Quantity */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Cantidad a recibir</label>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => onChange(idx, { qtyToReceive: Math.max(0, item.qtyToReceive - 1) })}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                <Minus size={13} />
              </button>
              <input type="number" value={item.qtyToReceive} min={0} max={maxQty}
                onChange={(e) => onChange(idx, { qtyToReceive: Math.min(maxQty, Math.max(0, Number(e.target.value))) })}
                className="w-20 text-center border border-slate-200 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button type="button"
                onClick={() => onChange(idx, { qtyToReceive: Math.min(maxQty, item.qtyToReceive + 1) })}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                <Plus size={13} />
              </button>
              <button type="button"
                onClick={() => onChange(idx, { qtyToReceive: maxQty })}
                className="ml-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                Recibir todo
              </button>
            </div>
          </div>

          {/* Serial / Batch */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                <Hash size={11} /> N° de serie
              </label>
              <input value={item.serialNumber}
                onChange={(e) => onChange(idx, { serialNumber: e.target.value })}
                placeholder="SN-XXXXXXXX"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                <ScanLine size={11} /> Código / Lote
              </label>
              <input value={item.batchCode}
                onChange={(e) => onChange(idx, { batchCode: e.target.value })}
                placeholder="LOTE-2026-001"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* QR / Barcode scanner */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Escanear código</label>
            <QrScannerButton onScan={(code) => {
              // If scanned code matches SKU → auto-fill serial
              if (code === item.sku || code.includes(item.sku)) {
                toast.success(`Producto verificado: ${item.productName}`);
              }
              onChange(idx, { serialNumber: code });
            }} />
          </div>

          {/* Photo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
              <Camera size={11} /> Foto de recepción
            </label>
            <InlinePhotoUpload
              value={item.receiptPhotoUrl}
              onChange={(url) => onChange(idx, { receiptPhotoUrl: url })}
            />
          </div>

          {/* Cost summary */}
          <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>Costo unitario: {fmtCurrency(item.unitCost)}</span>
            <span className="font-semibold text-slate-700">
              Total recibido: {fmtCurrency(item.qtyToReceive * item.unitCost)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ReceiveOrderModal({ order, onClose, onDone }: {
  order: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { workspaceId } = useRole();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ItemState[]>(
    order.items.map((i) => ({
      inventoryId: i.inventoryId,
      sku: i.sku,
      productName: i.productName,
      category: i.category,
      qtyOrdered: i.qtyOrdered,
      qtyAlreadyReceived: i.qtyReceived,
      qtyToReceive: i.qtyOrdered - i.qtyReceived,
      unitCost: i.unitCost,
      total: i.total,
      serialNumber: i.serialNumber ?? "",
      batchCode: i.batchCode ?? "",
      receiptPhotoUrl: i.receiptPhotoUrl ?? "",
    }))
  );

  function updateItem(idx: number, patch: Partial<ItemState>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function receiveAll() {
    setItems(prev => prev.map(it => ({
      ...it,
      qtyToReceive: it.qtyOrdered - it.qtyAlreadyReceived,
    })));
  }

  const totalToReceive = items.reduce((s, i) => s + i.qtyToReceive, 0);
  const totalCost      = items.reduce((s, i) => s + i.qtyToReceive * i.unitCost, 0);
  const allDone        = items.every(i => i.qtyToReceive >= i.qtyOrdered - i.qtyAlreadyReceived);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (totalToReceive === 0) { toast.error("Ingresa al menos una unidad a recibir"); return; }

    setSaving(true);
    const merged: PurchaseOrderItem[] = order.items.map((orig, i) => ({
      ...orig,
      qtyReceived: orig.qtyReceived + items[i].qtyToReceive,
      serialNumber: items[i].serialNumber,
      batchCode: items[i].batchCode,
      receiptPhotoUrl: items[i].receiptPhotoUrl,
    }));

    const r = await receivePurchaseOrder(workspaceId, order.id, merged);
    setSaving(false);
    if (r.ok) { toast.success(r.message); onDone(); onClose(); }
    else toast.error(r.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Registrar recepción</h2>
            <p className="text-xs text-slate-400">{order.orderNumber} · {order.supplierName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={receiveAll}
              className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition font-medium">
              Recibir todo
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Items */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-3">
          <p className="text-xs text-slate-500 mb-4">
            Completa los detalles de cada producto recibido. El stock se actualizará automáticamente al confirmar.
          </p>

          {items.map((item, idx) => (
            <ItemCard
              key={item.inventoryId}
              item={item}
              idx={idx}
              onChange={updateItem}
              orderNumber={order.orderNumber}
            />
          ))}

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 mt-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Total unidades a recibir</span>
              <span className="font-semibold">{totalToReceive}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2 mt-1">
              <span>Valor total recibido</span>
              <span className="text-emerald-600">{fmtCurrency(totalCost)}</span>
            </div>
            {allDone && (
              <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                <CheckCircle2 size={12} /> Todos los productos serán marcados como recibidos
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || totalToReceive === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
              {saving ? "Guardando…" : `Confirmar recepción (${totalToReceive} unidades)`}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-3 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
