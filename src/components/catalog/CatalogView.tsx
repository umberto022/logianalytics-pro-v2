"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, ShoppingBag, Plus, Minus, Trash2, CheckCircle2, Image as ImageIcon, Clock, Truck, Store } from "lucide-react";
import toast from "react-hot-toast";
import type { PublicCatalogPayload, PublicCatalogProduct } from "@/lib/catalogPublicPayload";
import { computeCartPricing } from "@/lib/catalogPricing";
import { fmtRD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CartLine {
  key: string;
  productId: string;
  productName: string;
  category: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
  imageUrl: string | null;
  allowBackorder: boolean;
  inStock: boolean;
}

function effectivePriceCents(product: PublicCatalogProduct, variantId: string | undefined, quantity: number): number | null {
  const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
  let price = variant ? variant.priceCents : product.basePriceCents;
  const rule = [...product.quantityPricing].filter((r) => quantity >= r.minQty).sort((a, b) => b.minQty - a.minQty)[0];
  if (rule) price = rule.unitPriceCents;
  return price;
}

const DOMINICAN_CODE = "+1";

export function CatalogView({ data, mode, slug }: { data: PublicCatalogPayload; mode: "public" | "preview"; slug?: string }) {
  const storageKey = `catalog-cart-${slug ?? "preview"}`;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Todas");
  const [detail, setDetail] = useState<PublicCatalogProduct | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<"grid" | "cart" | "checkout" | "done">("grid");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ publicRef: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCart(JSON.parse(raw));
    } catch { /* localStorage puede fallar (privado/bloqueado) — el carrito simplemente arranca vacío */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* no crítico */ }
  }, [cart, storageKey]);

  const productsById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const categories = useMemo(() => ["Todas", ...Array.from(new Set(data.products.map((p) => p.category).filter(Boolean)))], [data.products]);

  const filtered = useMemo(() => data.products.filter((p) =>
    (category === "Todas" || p.category === category) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))
  ), [data.products, search, category]);

  function addToCart(product: PublicCatalogProduct, variantId: string | undefined, quantity: number) {
    const key = `${product.id}:${variantId ?? ""}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
      return [...prev, {
        key, productId: product.id, productName: product.name, category: product.category,
        variantId, variantLabel: variant?.label, quantity,
        imageUrl: product.imageUrl, allowBackorder: product.allowBackorder, inStock: product.inStock,
      }];
    });
    toast.success(`${product.name} agregado al carrito`);
    setDetail(null);
  }

  function updateQty(key: string, quantity: number) {
    setCart((prev) => (quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))));
  }

  const pricingLines = useMemo(() => cart.map((l) => {
    const product = productsById.get(l.productId);
    const priceCents = product ? effectivePriceCents(product, l.variantId, l.quantity) ?? 0 : 0;
    return { unitPriceCents: priceCents, quantity: l.quantity };
  }), [cart, productsById]);

  const pricing = useMemo(() => computeCartPricing(pricingLines, {
    customerType: "nuevo", // estimado visual — el tipo real (nuevo/frecuente) lo resuelve el servidor al enviar
    discountRule: data.discountRule,
    advanceRule: data.advanceRule,
  }), [pricingLines, data.discountRule, data.advanceRule]);

  const hasBackorderInCart = cart.some((l) => !l.inStock);

  return (
    <div
      className="min-h-screen bg-white text-slate-800"
      style={{ ["--catalog-primary" as string]: data.colors.primary, ["--catalog-accent" as string]: data.colors.accent }}
    >
      {mode === "preview" && (
        <div className="bg-amber-100 text-amber-800 text-center text-xs font-semibold py-2 px-4 sticky top-0 z-30">
          Vista previa — así lo van a ver tus clientes. El envío de solicitudes está desactivado acá.
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-100 shadow-sm" style={{ top: mode === "preview" ? "28px" : 0 }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt={data.businessName} className="w-11 h-11 rounded-full object-cover border border-slate-100" />
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "var(--catalog-primary)" }}>
              {data.businessName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-slate-900 truncate">{data.businessName}</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} /> {data.leadTimeNote}</p>
          </div>
          <button
            onClick={() => setView("cart")}
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "var(--catalog-primary)" }}
          >
            <ShoppingBag size={18} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cart.reduce((s, l) => s + l.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Search + filters */}
        <div className="max-w-3xl mx-auto px-4 pb-3 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos…"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: "var(--catalog-primary)" }}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition",
                  category === c ? "text-white border-transparent" : "text-slate-600 border-slate-200 bg-white")}
                style={category === c ? { background: "var(--catalog-primary)" } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Product grid */}
      {view === "grid" && (
        <main className="max-w-3xl mx-auto px-4 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No encontramos productos con ese criterio.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((p) => {
                const price = effectivePriceCents(p, undefined, 1);
                return (
                  <button key={p.id} onClick={() => setDetail(p)}
                    className="text-left bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition"
                  >
                    <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={28} className="text-slate-300" />
                      )}
                      {!p.inStock && (
                        <span className="absolute top-1.5 left-1.5 bg-slate-900/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                          {p.allowBackorder ? "Por encargo" : "Agotado"}
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">{p.name}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: "var(--catalog-primary)" }}>
                        {price !== null ? fmtRD(price) : "Consultar precio"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Sticky bottom bar */}
      {view === "grid" && cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20">
          <button onClick={() => setView("cart")}
            className="max-w-3xl mx-auto w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-semibold text-sm"
            style={{ background: "var(--catalog-primary)" }}
          >
            <span>Ver carrito · {cart.reduce((s, l) => s + l.quantity, 0)} producto(s)</span>
            <span>{fmtRD(pricing.productsTotalCents)}</span>
          </button>
        </div>
      )}

      {/* Product detail modal */}
      {detail && (
        <ProductModal product={detail} onClose={() => setDetail(null)} onAdd={addToCart} />
      )}

      {/* Cart sheet */}
      {view === "cart" && (
        <CartSheet
          cart={cart} data={data} pricing={pricing} hasBackorderInCart={hasBackorderInCart}
          onClose={() => setView("grid")}
          onUpdateQty={updateQty}
          onCheckout={() => setView("checkout")}
        />
      )}

      {/* Checkout */}
      {view === "checkout" && (
        <CheckoutSheet
          cart={cart} data={data} slug={slug} mode={mode} submitting={submitting} setSubmitting={setSubmitting}
          onClose={() => setView("cart")}
          onDone={(ref) => { setConfirmation({ publicRef: ref }); setCart([]); setView("done"); }}
        />
      )}

      {/* Confirmation */}
      {view === "done" && confirmation && (
        <div className="fixed inset-0 z-40 bg-white flex flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 size={56} style={{ color: "var(--catalog-primary)" }} />
          <h2 className="text-lg font-bold text-slate-900 mt-4">¡Solicitud enviada!</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-xs">
            Recibimos tu solicitud. Stefany revisará la disponibilidad, el importe final y las condiciones de entrega para enviarte una cotización.
          </p>
          <div className="mt-4 bg-slate-50 rounded-xl px-4 py-2 font-mono text-sm font-bold text-slate-700">
            Referencia: {confirmation.publicRef}
          </div>
          <button onClick={() => setView("grid")}
            className="mt-6 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: "var(--catalog-primary)" }}
          >
            Seguir viendo el catálogo
          </button>
        </div>
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onAdd }: {
  product: PublicCatalogProduct;
  onClose: () => void;
  onAdd: (p: PublicCatalogProduct, variantId: string | undefined, qty: number) => void;
}) {
  const [variantId, setVariantId] = useState<string | undefined>(product.variants[0]?.id);
  const [qty, setQty] = useState(1);
  const price = effectivePriceCents(product, variantId, qty);
  const canAdd = price !== null && (product.inStock || product.allowBackorder);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto z-10">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 bg-white/90 rounded-full p-1.5"><X size={16} /></button>
        <div className="aspect-square bg-slate-50 flex items-center justify-center">
          {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <ImageIcon size={40} className="text-slate-300" />}
        </div>
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{product.category}</p>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{product.name}</h2>
          {product.description && <p className="text-sm text-slate-500 mt-1.5">{product.description}</p>}

          {!product.inStock && (
            <p className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 inline-block px-2.5 py-1 rounded-full">
              {product.allowBackorder ? "Sin stock ahora — disponible por encargo, requiere más tiempo" : "Agotado"}
            </p>
          )}

          {product.variants.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Elegí una opción</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border",
                      variantId === v.id ? "text-white border-transparent" : "border-slate-200 text-slate-600")}
                    style={variantId === v.id ? { background: "var(--catalog-primary)" } : undefined}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-5">
            <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-2 py-1">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-1.5 text-slate-500"><Minus size={14} /></button>
              <span className="w-6 text-center text-sm font-semibold">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(99, q + 1))} className="p-1.5 text-slate-500"><Plus size={14} /></button>
            </div>
            <p className="text-lg font-bold" style={{ color: "var(--catalog-primary)" }}>
              {price !== null ? fmtRD(price * qty) : "Consultar precio"}
            </p>
          </div>

          <button
            disabled={!canAdd}
            onClick={() => onAdd(product, variantId, qty)}
            className="w-full mt-4 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: "var(--catalog-primary)" }}
          >
            {canAdd ? "Añadir al carrito" : "No disponible por ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartSheet({ cart, data, pricing, hasBackorderInCart, onClose, onUpdateQty, onCheckout }: {
  cart: CartLine[];
  data: PublicCatalogPayload;
  pricing: ReturnType<typeof computeCartPricing>;
  hasBackorderInCart: boolean;
  onClose: () => void;
  onUpdateQty: (key: string, qty: number) => void;
  onCheckout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col z-10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Tu carrito</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        {cart.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Tu carrito está vacío.</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 px-4">
              {cart.map((l) => (
                <div key={l.key} className="py-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-slate-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {l.imageUrl ? <img src={l.imageUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.productName}</p>
                    {l.variantLabel && <p className="text-xs text-slate-400">{l.variantLabel}</p>}
                    {!l.inStock && <p className="text-[11px] font-semibold text-amber-600">Por encargo — requiere más tiempo</p>}
                  </div>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-1.5 py-0.5">
                    <button onClick={() => onUpdateQty(l.key, l.quantity - 1)} className="p-1 text-slate-500"><Minus size={12} /></button>
                    <span className="w-5 text-center text-xs font-semibold">{l.quantity}</span>
                    <button onClick={() => onUpdateQty(l.key, l.quantity + 1)} className="p-1 text-slate-500"><Plus size={12} /></button>
                  </div>
                  <button onClick={() => onUpdateQty(l.key, 0)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fmtRD(pricing.subtotalCents)}</span></div>
              {pricing.discountApplies && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Descuento ({pricing.discountPct}%)</span><span>-{fmtRD(pricing.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-50">
                <span>Total estimado de productos</span><span>{fmtRD(pricing.productsTotalCents)}</span>
              </div>
              <p className="text-xs text-slate-400">Envío por cotizar. {data.advanceRule.pct}% de anticipo puede aplicar según el pedido — Stefany lo confirma al cotizar.</p>
              {hasBackorderInCart && <p className="text-xs font-medium text-amber-600">Hay productos por encargo: requieren más tiempo de entrega.</p>}
            </div>

            <div className="p-4 pt-0">
              <button onClick={onCheckout}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: "var(--catalog-primary)" }}
              >
                Continuar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckoutSheet({ cart, data, slug, mode, submitting, setSubmitting, onClose, onDone }: {
  cart: CartLine[];
  data: PublicCatalogPayload;
  slug?: string;
  mode: "public" | "preview";
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onClose: () => void;
  onDone: (ref: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(DOMINICAN_CODE + " ");
  const [deliveryMethod, setDeliveryMethod] = useState<"retiro" | "entrega">(data.pickup.enabled ? "retiro" : "entrega");
  const [zone, setZone] = useState(data.delivery.zones[0] ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const valid = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 8 &&
    (deliveryMethod === "retiro" || (zone && address.trim().length >= 4));

  async function submit() {
    if (!valid) { toast.error("Completá nombre, WhatsApp y los datos de entrega"); return; }
    if (mode === "preview") { toast("Vista previa: el envío está desactivado acá.", { icon: "👀" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/catalogo/${slug}/solicitud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((l) => ({ inventoryId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          customerName: name.trim(),
          customerPhone: phone.replace(/\s+/g, ""),
          deliveryMethod,
          zone: deliveryMethod === "entrega" ? zone : undefined,
          address: deliveryMethod === "entrega" ? address.trim() : undefined,
          note: note.trim() || undefined,
          website,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { toast.error(json.error ?? "No se pudo enviar la solicitud"); return; }
      onDone(json.publicRef);
    } catch {
      toast.error("Error de conexión — intentá de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  const inp = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2";

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto z-10 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900">Datos para tu solicitud</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="space-y-3">
          {/* honeypot — oculto a personas, visible para bots */}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
            className="absolute opacity-0 pointer-events-none w-0 h-0" aria-hidden />

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nombre *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Tu nombre" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">WhatsApp (con código de país) *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} placeholder="+1 809 000 0000" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Modalidad *</label>
            <div className="flex gap-2">
              {data.pickup.enabled && (
                <button onClick={() => setDeliveryMethod("retiro")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border",
                    deliveryMethod === "retiro" ? "text-white border-transparent" : "border-slate-200 text-slate-600")}
                  style={deliveryMethod === "retiro" ? { background: "var(--catalog-primary)" } : undefined}
                >
                  <Store size={14} /> Retiro
                </button>
              )}
              {data.delivery.enabled && (
                <button onClick={() => setDeliveryMethod("entrega")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border",
                    deliveryMethod === "entrega" ? "text-white border-transparent" : "border-slate-200 text-slate-600")}
                  style={deliveryMethod === "entrega" ? { background: "var(--catalog-primary)" } : undefined}
                >
                  <Truck size={14} /> Entrega
                </button>
              )}
            </div>
          </div>

          {deliveryMethod === "entrega" && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Zona *</label>
                <select value={zone} onChange={(e) => setZone(e.target.value)} className={inp}>
                  {data.delivery.zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Dirección *</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inp} placeholder="Calle, sector, referencia" />
              </div>
            </>
          )}
          {deliveryMethod === "retiro" && data.pickup.address && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">Retiro en: {data.pickup.address}</p>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Observación (opcional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cn(inp, "resize-none")} placeholder="Alguna indicación para tu pedido…" />
          </div>
        </div>

        <button onClick={submit} disabled={!valid || submitting}
          className="w-full mt-5 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
          style={{ background: "var(--catalog-primary)" }}
        >
          {submitting ? "Enviando…" : "Solicitar cotización"}
        </button>
      </div>
    </div>
  );
}
