"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Store, Copy, Eye, Upload, Plus, X, AlertTriangle, CheckCircle2,
  Image as ImageIcon, Trash2, Package,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useCatalogSettings } from "@/hooks/useCatalogSettings";
import { updateCatalogSettings } from "@/lib/firestore/catalogSettings";
import { useInventory, useInvalidateInventory } from "@/hooks/useInventory";
import { updateInventoryItem } from "@/lib/firestore/inventory";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { fmtCurrency } from "@/lib/utils";
import { fromCents, toCents } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import type { CatalogVariant, CatalogQuantityPriceRule, InventoryItem } from "@/types";

export default function CatalogoPage() {
  const { profile } = useAuth();
  const { workspaceId } = useRole();
  const { settings, loading, refetch } = useCatalogSettings();
  const { items, loading: itemsLoading } = useInventory();
  const invalidateInventory = useInvalidateInventory();
  const [editingProduct, setEditingProduct] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Formulario local — se guarda explícitamente con "Guardar cambios".
  const [businessName, setBusinessName] = useState("");
  const [primary, setPrimary] = useState("#EC4899");
  const [accent, setAccent] = useState("#C084FC");
  const [logoUrl, setLogoUrl] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [zones, setZones] = useState<string[]>([]);
  const [newZone, setNewZone] = useState("");

  useEffect(() => {
    if (!settings) return;
    setBusinessName(settings.businessName);
    setPrimary(settings.colors.primary);
    setAccent(settings.colors.accent);
    setLogoUrl(settings.logoUrl ?? "");
    setWhatsapp(settings.whatsappNumber ?? "");
    setPickupEnabled(settings.pickup.enabled);
    setPickupAddress(settings.pickup.address ?? "");
    setDeliveryEnabled(settings.delivery.enabled);
    setZones(settings.delivery.zones);
  }, [settings]);

  const publishedItems = useMemo(() => items.filter((i) => i.catalog?.published), [items]);
  const missingPrice = useMemo(() => publishedItems.filter((i) => {
    const hasBase = i.salePrice > 0;
    const hasVariantPrices = (i.catalog?.variants ?? []).length > 0 && (i.catalog?.variants ?? []).every((v) => v.priceOverrideCents !== undefined);
    return !hasBase && !hasVariantPrices;
  }), [publishedItems]);

  const checklist = useMemo(() => {
    if (!settings) return [];
    const list: { ok: boolean; label: string }[] = [
      { ok: publishedItems.length > 0, label: "Al menos un producto publicado" },
      { ok: missingPrice.length === 0, label: "Todos los productos publicados tienen precio" },
      { ok: !!whatsapp, label: "Número de WhatsApp configurado" },
      { ok: !pickupEnabled || !!pickupAddress, label: "Dirección de retiro configurada (si ofrecés retiro)" },
      { ok: !deliveryEnabled || zones.length > 0, label: "Al menos una zona de entrega (si ofrecés entrega)" },
      { ok: !!settings.commercialRulesConfirmed, label: "Condiciones comerciales confirmadas" },
    ];
    return list;
  }, [settings, publishedItems, missingPrice, whatsapp, pickupEnabled, pickupAddress, deliveryEnabled, zones]);

  const readyToPublish = checklist.every((c) => c.ok);
  const publicUrl = settings ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${settings.publicSlug}` : "";

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadToCloudinary(file, file.name, "profile-photos");
      setLogoUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo el logo");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  function addZone() {
    const z = newZone.trim();
    if (z && !zones.includes(z)) setZones((p) => [...p, z]);
    setNewZone("");
  }

  async function handleSave() {
    if (!workspaceId) return;
    setSaving(true);
    const result = await updateCatalogSettings(workspaceId, {
      businessName, logoUrl, colors: { primary, accent },
      whatsappNumber: whatsapp,
      pickup: { enabled: pickupEnabled, address: pickupAddress },
      delivery: { enabled: deliveryEnabled, zones },
    });
    if (result.ok) { toast.success(result.message); refetch(); } else toast.error(result.message);
    setSaving(false);
  }

  async function togglePublish(item: InventoryItem) {
    const published = !(item.catalog?.published ?? false);
    const result = await updateInventoryItem(workspaceId, item.id, {
      catalog: { ...(item.catalog ?? {}), published },
    });
    if (result.ok) { invalidateInventory(); toast.success(published ? `"${item.name}" publicado` : `"${item.name}" retirado del catálogo`); }
    else toast.error(result.message);
  }

  async function toggleWhatsappNotificationsConsent(checked: boolean) {
    if (!workspaceId) return;
    const result = await updateCatalogSettings(workspaceId, {
      whatsappNotificationsConsent: checked,
      ...(checked
        ? { whatsappNotificationsConsentBy: profile?.fullName || profile?.email || "—", whatsappNotificationsConsentAt: Timestamp.now() }
        : {}),
    });
    if (result.ok) { toast.success(checked ? "Avisos automáticos activados" : "Avisos automáticos desactivados"); refetch(); }
    else toast.error(result.message);
  }

  async function toggleCommercialRulesConfirmed(checked: boolean) {
    if (!workspaceId) return;
    const result = await updateCatalogSettings(workspaceId, {
      commercialRulesConfirmed: checked,
      ...(checked
        ? { commercialRulesConfirmedBy: profile?.fullName || profile?.email || "—", commercialRulesConfirmedAt: Timestamp.now() }
        : {}),
    });
    if (result.ok) { toast.success(checked ? "Condiciones comerciales confirmadas" : "Confirmación retirada"); refetch(); }
    else toast.error(result.message);
  }

  async function handlePublishToggle() {
    if (!workspaceId || !settings) return;
    if (!settings.enabled && !readyToPublish) {
      toast.error("Completá lo pendiente de la lista antes de publicar");
      return;
    }
    const result = await updateCatalogSettings(workspaceId, { enabled: !settings.enabled });
    if (result.ok) { toast.success(!settings.enabled ? "Catálogo publicado" : "Catálogo retirado"); refetch(); }
    else toast.error(result.message);
  }

  if (loading || itemsLoading || !settings) return <div className="space-y-5"><TableSkeleton rows={6} cols={4} /></div>;

  return (
    <div>
      <PageHeader
        title="Mi catálogo"
        subtitle={settings.enabled ? `Público en ${publicUrl}` : "Todavía no está publicado"}
        action={
          <div className="flex items-center gap-2">
            <Link href="/catalogo/vista-previa"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Eye size={13} /> Vista previa
            </Link>
            {settings.enabled && (
              <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Enlace copiado"); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Copy size={13} /> Copiar enlace
              </button>
            )}
            <button onClick={handlePublishToggle}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition text-white ${settings.enabled ? "bg-slate-500 hover:bg-slate-600" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              <Store size={13} /> {settings.enabled ? "Retirar catálogo" : "Publicar catálogo"}
            </button>
          </div>
        }
      />

      {/* Checklist */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 dark:bg-slate-800 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 mb-2 dark:text-slate-200">Antes de publicar</p>
        <ul className="space-y-1.5">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              {c.ok ? <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />}
              <span className={c.ok ? "text-slate-500 dark:text-slate-400" : "text-slate-700 font-medium dark:text-slate-200"}>{c.label}</span>
            </li>
          ))}
        </ul>
        {missingPrice.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">Sin precio: {missingPrice.map((i) => i.name).join(", ")}</p>
        )}
      </div>

      {/* Condiciones comerciales — deben confirmarse una vez antes de poder publicar */}
      <div className={`rounded-2xl border p-4 mb-5 ${settings.commercialRulesConfirmed ? "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700" : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800"}`}>
        <p className={`text-sm font-semibold mb-1.5 ${settings.commercialRulesConfirmed ? "text-slate-700 dark:text-slate-200" : "text-amber-800 dark:text-amber-300"}`}>
          Condiciones comerciales
        </p>
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
          <li>Descuento del {settings.discountRule.pct}% al comprar {settings.discountRule.minQty} unidades o más (iguales o combinadas), solo sobre productos — el delivery nunca lo lleva.</li>
          <li>Pedido grande: desde RD${(settings.advanceRule.largeOrderThresholdCents / 100).toLocaleString("es-DO")} inclusive, calculado después del descuento y sin delivery.</li>
          <li>Anticipo del {settings.advanceRule.pct}% del total de productos (después del descuento, sin delivery) para clientes nuevos o pedidos grandes; cliente frecuente con pedido menor puede pagar contra entrega.</li>
          <li>El delivery se cotiza aparte y se suma al saldo pendiente — no lleva descuento ni cuenta para el anticipo.</li>
          {settings.pricesAreFinal && <li>El precio publicado es el precio final del producto — no se suman cargos adicionales en el catálogo ni en la cotización.</li>}
          <li>Los pagos se coordinan por WhatsApp y quedan registrados por quien administra el catálogo.</li>
        </ul>

        <label className="flex items-start gap-2 text-sm mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <input type="checkbox" className="mt-0.5" checked={!!settings.commercialRulesConfirmed}
            onChange={(e) => toggleCommercialRulesConfirmed(e.target.checked)} />
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            Confirmo que revisé y apruebo estas condiciones comerciales para mi negocio.
          </span>
        </label>
        {settings.commercialRulesConfirmed ? (
          <p className="text-xs text-emerald-600 mt-1.5">
            Confirmado por {settings.commercialRulesConfirmedBy || "—"}
            {settings.commercialRulesConfirmedAt ? ` el ${settings.commercialRulesConfirmedAt.toDate().toLocaleDateString("es-DO")}` : ""}.
          </p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">No podés publicar el catálogo hasta confirmar esto.</p>
        )}
      </div>

      {/* Identidad */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 space-y-4 dark:bg-slate-800 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Identidad</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 dark:bg-slate-700">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" /> : <ImageIcon size={22} className="text-slate-300" />}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition dark:border-slate-700 dark:text-slate-300">
            <Upload size={13} /> {uploadingLogo ? "Subiendo…" : "Subir logo"}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
          </label>
        </div>
        <div>
          <label className={lbl}>Nombre del negocio</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Color principal</label>
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200" />
          </div>
          <div>
            <label className={lbl}>Color secundario</label>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200" />
          </div>
        </div>
        <div>
          <label className={lbl}>WhatsApp comercial (con código de país)</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inp} placeholder="+1 809 000 0000" />
        </div>

        <label className="flex items-start gap-2 text-sm pt-2 border-t border-slate-100 dark:border-slate-700">
          <input type="checkbox" className="mt-0.5" checked={!!settings.whatsappNotificationsConsent}
            onChange={(e) => toggleWhatsappNotificationsConsent(e.target.checked)} />
          <span className="text-slate-700 dark:text-slate-200">
            Avisarme automáticamente por WhatsApp a este número cada vez que llegue una solicitud nueva del catálogo.
            <span className="block text-xs text-slate-400 mt-0.5">
              El aviso llega desde un número de WhatsApp Business dedicado (no desde este mismo número) e incluye nombre, WhatsApp, referencia, resumen del pedido y un enlace a la solicitud dentro del sistema. Podés desactivarlo cuando quieras — la solicitud igual queda guardada aunque el aviso falle.
            </span>
          </span>
        </label>
        {settings.whatsappNotificationsConsent && (
          <p className="text-xs text-emerald-600">
            Activado por {settings.whatsappNotificationsConsentBy || "—"}
            {settings.whatsappNotificationsConsentAt ? ` el ${settings.whatsappNotificationsConsentAt.toDate().toLocaleDateString("es-DO")}` : ""}.
          </p>
        )}
      </div>

      {/* Entrega y retiro */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 space-y-4 dark:bg-slate-800 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Retiro y entrega</p>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} />
          Ofrezco retiro
        </label>
        {pickupEnabled && (
          <input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className={inp} placeholder="Dirección de retiro" />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={deliveryEnabled} onChange={(e) => setDeliveryEnabled(e.target.checked)} />
          Ofrezco entrega
        </label>
        {deliveryEnabled && (
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {zones.map((z) => (
                <span key={z} className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-full dark:bg-slate-700 dark:text-slate-300">
                  {z}
                  <button onClick={() => setZones((p) => p.filter((x) => x !== z))}><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newZone} onChange={(e) => setNewZone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addZone()}
                className={inp} placeholder="Agregar zona (ej. Santo Domingo Oeste)" />
              <button onClick={addZone} className="px-3 rounded-lg border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"><Plus size={15} /></button>
            </div>
          </div>
        )}
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {/* Productos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Productos ({publishedItems.length} publicados de {items.length})</p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-slate-400 text-center">No hay productos en tu inventario todavía — agregalos desde Inventario primero.</p>
          ) : items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={!!item.catalog?.published} onChange={() => togglePublish(item)} className="flex-shrink-0" />
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex-shrink-0 overflow-hidden flex items-center justify-center dark:bg-slate-700">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate dark:text-slate-100">{item.name}</p>
                <p className="text-xs text-slate-400">{item.category} · {item.salePrice > 0 ? fmtCurrency(item.salePrice) : "Sin precio"} · Stock {item.currentStock}</p>
              </div>
              <button onClick={() => setEditingProduct(item)}
                className="text-xs font-semibold text-brand-600 hover:underline flex-shrink-0">
                Editar catálogo
              </button>
            </div>
          ))}
        </div>
      </div>

      {editingProduct && (
        <ProductCatalogModal
          item={editingProduct}
          workspaceId={workspaceId}
          onClose={() => setEditingProduct(null)}
          onSaved={() => { invalidateInventory(); setEditingProduct(null); }}
        />
      )}
    </div>
  );
}

const inp = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";
const lbl = "block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300";

function ProductCatalogModal({ item, workspaceId, onClose, onSaved }: {
  item: InventoryItem;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(item.catalog?.description ?? "");
  const [allowBackorder, setAllowBackorder] = useState(item.catalog?.allowBackorder ?? false);
  const [variants, setVariants] = useState<CatalogVariant[]>(item.catalog?.variants ?? []);
  const [qtyRules, setQtyRules] = useState<CatalogQuantityPriceRule[]>(item.catalog?.quantityPricing ?? []);
  const [saving, setSaving] = useState(false);

  function addVariant() {
    setVariants((p) => [...p, { id: `v${Date.now()}`, label: "" }]);
  }
  function addQtyRule() {
    setQtyRules((p) => [...p, { minQty: 2, unitPriceCents: toCents(item.salePrice) }]);
  }

  async function save() {
    setSaving(true);
    const result = await updateInventoryItem(workspaceId, item.id, {
      catalog: {
        published: item.catalog?.published ?? false,
        description,
        allowBackorder,
        variants: variants.filter((v) => v.label.trim()),
        quantityPricing: qtyRules.filter((r) => r.minQty > 0 && r.unitPriceCents > 0),
      },
    });
    setSaving(false);
    if (result.ok) { toast.success("Catálogo del producto actualizado"); onSaved(); } else toast.error(result.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto dark:bg-slate-800">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{item.name}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition dark:hover:bg-slate-700"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={lbl}>Descripción para el catálogo</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Qué es, presentación, materiales…" />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={allowBackorder} onChange={(e) => setAllowBackorder(e.target.checked)} />
            Admitir pedido por encargo si no hay stock
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={lbl + " mb-0"}>Variantes (color, tamaño, diseño…)</label>
              <button onClick={addVariant} className="text-xs font-semibold text-brand-600 flex items-center gap-1"><Plus size={12} /> Agregar</button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.id} className="flex items-center gap-2">
                  <input value={v.label} onChange={(e) => setVariants((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    className={inp} placeholder="Ej. Color: Rojo" />
                  <input type="number" step="0.01"
                    value={v.priceOverrideCents !== undefined ? fromCents(v.priceOverrideCents) : ""}
                    onChange={(e) => setVariants((p) => p.map((x, j) => j === i ? { ...x, priceOverrideCents: e.target.value === "" ? undefined : toCents(Number(e.target.value)) } : x))}
                    className={`${inp} w-28`} placeholder="Precio" />
                  <button onClick={() => setVariants((p) => p.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
              {variants.length === 0 && <p className="text-xs text-slate-400">Sin variantes — se vende con el precio base.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={lbl + " mb-0"}>Precio por cantidad</label>
              <button onClick={addQtyRule} className="text-xs font-semibold text-brand-600 flex items-center gap-1"><Plus size={12} /> Agregar</button>
            </div>
            <div className="space-y-2">
              {qtyRules.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Desde</span>
                  <input type="number" value={r.minQty} onChange={(e) => setQtyRules((p) => p.map((x, j) => j === i ? { ...x, minQty: Number(e.target.value) } : x))}
                    className={`${inp} w-20`} />
                  <span className="text-xs text-slate-500">unidades a</span>
                  <input type="number" step="0.01" value={fromCents(r.unitPriceCents)}
                    onChange={(e) => setQtyRules((p) => p.map((x, j) => j === i ? { ...x, unitPriceCents: toCents(Number(e.target.value)) } : x))}
                    className={`${inp} w-28`} />
                  <button onClick={() => setQtyRules((p) => p.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
