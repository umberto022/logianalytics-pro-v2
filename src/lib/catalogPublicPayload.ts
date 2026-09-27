// Shape público del catálogo — compartido entre la ruta pública
// (/api/catalogo/[slug]) y la vista previa autenticada
// (/api/catalogo/preview), para no duplicar (y no dejar divergir) qué campos
// son seguros de exponer. Nunca incluye unitCost, supplier, currentStock
// exacto, ni el workspaceId/uid.
import type { Firestore } from "firebase-admin/firestore";
import { toCents } from "@/lib/money";

export interface PublicCatalogProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string | null;
  basePriceCents: number | null;
  variants: { id: string; label: string; priceCents: number | null }[];
  quantityPricing: { minQty: number; unitPriceCents: number }[];
  inStock: boolean;
  allowBackorder: boolean;
}

export interface PublicCatalogPayload {
  businessName: string;
  logoUrl: string | null;
  colors: { primary: string; accent: string };
  whatsappConfigured: boolean;
  pickup: { enabled: boolean; address?: string };
  delivery: { enabled: boolean; zones: string[] };
  leadTimeNote: string;
  discountRule: { minQty: number; pct: number; appliesToShipping: boolean };
  advanceRule: { pct: number; largeOrderThresholdCents: number; thresholdAfterDiscountExcludingShipping: boolean };
  products: PublicCatalogProduct[];
}

/**
 * Resuelve un slug público a su workspace, validando en un solo lugar TODO lo
 * que hace que un catálogo sea realmente accesible al público:
 *  - que el slug exista,
 *  - que la propia Stefany lo haya publicado (`catalogSettings.enabled`),
 *  - que el WORKSPACE (la cuenta) siga activo — antes esto no se chequeaba acá,
 *    así que una empresa suspendida/cancelada (ver `workspaceStatus` en
 *    UserProfile, mismo campo que usa `workspaceIsActive()` en firestore.rules)
 *    seguía recibiendo pedidos públicos aunque LogiAnalytics le hubiera
 *    cortado el acceso al resto de la app. Ausente = "active" (mismo
 *    grandfathering que el resto del proyecto).
 * Devuelve null si cualquiera de estas condiciones falla — el caller responde
 * siempre el mismo 404 genérico, sin distinguir el motivo.
 */
export async function resolvePublicCatalog(
  db: Firestore,
  slug: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ workspaceId: string; settings: any } | null> {
  const settingsSnap = await db.collection("catalogSettings")
    .where("publicSlug", "==", slug)
    .limit(1)
    .get();
  if (settingsSnap.empty) return null;

  const settingsDoc = settingsSnap.docs[0];
  const settings = settingsDoc.data();
  if (!settings.enabled) return null;

  const workspaceId = settingsDoc.id;
  const wsSnap = await db.collection("users").doc(workspaceId).get();
  const workspaceStatus = wsSnap.exists ? wsSnap.data()?.workspaceStatus : undefined;
  if (workspaceStatus && workspaceStatus !== "active") return null;

  return { workspaceId, settings };
}

export async function buildPublicCatalogPayload(
  db: Firestore,
  workspaceId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
): Promise<PublicCatalogPayload> {
  const itemsSnap = await db.collection("inventory").doc(workspaceId).collection("items")
    .where("catalog.published", "==", true)
    .get();

  const products: PublicCatalogProduct[] = itemsSnap.docs.map((d) => {
    const it = d.data();
    const catalog = it.catalog ?? {};
    const missingPrice = !it.salePrice || it.salePrice <= 0;
    const basePriceCents = missingPrice ? null : toCents(it.salePrice);
    return {
      id: d.id,
      name: it.name as string,
      category: it.category as string,
      description: (catalog.description as string) || "",
      imageUrl: (it.imageUrl as string) || null,
      basePriceCents,
      variants: ((catalog.variants ?? []) as Array<{ id: string; label: string; priceOverrideCents?: number }>).map((v) => ({
        id: v.id,
        label: v.label,
        priceCents: v.priceOverrideCents ?? basePriceCents,
      })),
      quantityPricing: (catalog.quantityPricing ?? []) as Array<{ minQty: number; unitPriceCents: number }>,
      inStock: (it.currentStock ?? 0) > 0,
      allowBackorder: !!catalog.allowBackorder,
    };
  }).filter((p) => p.basePriceCents !== null || p.variants.some((v) => v.priceCents !== null));

  return {
    businessName: settings.businessName,
    logoUrl: settings.logoUrl || null,
    colors: settings.colors,
    whatsappConfigured: !!settings.whatsappNumber,
    pickup: settings.pickup,
    delivery: settings.delivery,
    leadTimeNote: settings.leadTimeNote,
    discountRule: settings.discountRule,
    advanceRule: settings.advanceRule,
    products,
  };
}
