import { NextRequest } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";
import { toCents } from "@/lib/money";
import { computeCartPricing } from "@/lib/catalogPricing";
import { resolvePublicCatalog } from "@/lib/catalogPublicPayload";
import type { CatalogQuoteItem, CustomerType } from "@/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  items: z.array(z.object({
    inventoryId: z.string().min(1),
    variantId: z.string().optional(),
    quantity: z.number().int().positive().max(999),
  })).min(1).max(50),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(6).max(30),
  deliveryMethod: z.enum(["retiro", "entrega"]),
  zone: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
  // Honeypot: un campo que ningún visitante humano llena (oculto por CSS en
  // el form). Si viene con contenido, es un bot — protección simple contra
  // spam sin agregar ningún servicio pago.
  website: z.string().max(0).optional().or(z.literal("")),
});

function publicRefPrefix(businessName: string): string {
  const letters = businessName.match(/[A-Za-zÀ-ÿ]+/g) ?? [];
  const initials = letters.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  return initials || "PED";
}

function randomCode(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusión al leerlo por WhatsApp
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return noStore({ error: "Datos inválidos" }, { status: 400 });
  }

  if (body.website) {
    // Honeypot activado — respondemos como si hubiera salido bien, sin crear nada.
    return noStore({ ok: true, publicRef: randomCode(6) });
  }

  try {
    const db = getAdminDb();
    const resolved = await resolvePublicCatalog(db, params.slug);
    if (!resolved) return noStore({ error: "Catálogo no encontrado" }, { status: 404 });
    const { workspaceId, settings } = resolved;

    if (body.deliveryMethod === "entrega") {
      if (!settings.delivery?.enabled) return noStore({ error: "Esta empresa no ofrece entrega a domicilio" }, { status: 400 });
      if (!body.zone || !(settings.delivery.zones ?? []).includes(body.zone)) {
        return noStore({ error: "Zona de entrega inválida" }, { status: 400 });
      }
      if (!body.address) return noStore({ error: "Falta la dirección de entrega" }, { status: 400 });
    } else if (!settings.pickup?.enabled) {
      return noStore({ error: "Esta empresa no ofrece retiro" }, { status: 400 });
    }

    // Recalcular TODO server-side contra el inventario real — el precio que
    // haya mandado el navegador (si mandó alguno) se ignora por completo.
    const quoteItems: CatalogQuoteItem[] = [];
    for (const line of body.items) {
      const snap = await db.collection("inventory").doc(workspaceId).collection("items").doc(line.inventoryId).get();
      if (!snap.exists) return noStore({ error: `Un producto del pedido ya no está disponible` }, { status: 400 });
      const it = snap.data()!;
      const catalog = it.catalog ?? {};
      if (!catalog.published) return noStore({ error: `"${it.name}" ya no está disponible en el catálogo` }, { status: 400 });

      let unitPriceCents: number | null = it.salePrice > 0 ? toCents(it.salePrice) : null;
      let variantLabel: string | undefined;
      if (line.variantId) {
        const variant = ((catalog.variants ?? []) as Array<{ id: string; label: string; priceOverrideCents?: number }>)
          .find((v) => v.id === line.variantId);
        if (!variant) return noStore({ error: `Variante inválida para "${it.name}"` }, { status: 400 });
        variantLabel = variant.label;
        if (variant.priceOverrideCents !== undefined) unitPriceCents = variant.priceOverrideCents;
      }
      // Precio por cantidad: si hay una regla cuyo umbral se alcanza, pisa el
      // precio base/variante (configurado por Stefany específicamente para
      // esa cantidad).
      const qtyRules = (catalog.quantityPricing ?? []) as Array<{ minQty: number; unitPriceCents: number }>;
      const matchedRule = qtyRules
        .filter((r) => line.quantity >= r.minQty)
        .sort((a, b) => b.minQty - a.minQty)[0];
      if (matchedRule) unitPriceCents = matchedRule.unitPriceCents;

      if (unitPriceCents === null) {
        return noStore({ error: `"${it.name}" todavía no tiene precio cargado — no se puede cotizar` }, { status: 400 });
      }

      const currentStock = (it.currentStock ?? 0) as number;
      const isBackorder = currentStock < line.quantity;
      if (isBackorder && !catalog.allowBackorder) {
        return noStore({ error: `"${it.name}" no tiene stock suficiente y no admite encargo` }, { status: 400 });
      }

      quoteItems.push({
        inventoryId: line.inventoryId, sku: it.sku, productName: it.name, category: it.category,
        // Firestore (Admin SDK) rechaza `undefined` explícito en un campo —
        // a diferencia del cliente, que lo omite solo. Sin variante, no se
        // manda el campo en absoluto.
        ...(line.variantId ? { variantId: line.variantId, variantLabel } : {}),
        quantity: line.quantity, unitPriceCents, isBackorder,
      });
    }

    // Cliente: se busca por teléfono para heredar customerType si ya existe
    // (el visitante NUNCA puede declararse "frecuente" a sí mismo).
    const normalizedPhone = body.customerPhone.replace(/[^\d+]/g, "");
    const customersCol = db.collection("customers").doc(workspaceId).collection("records");
    const existingCustomerSnap = await customersCol.where("phone", "==", normalizedPhone).limit(1).get();
    let customerId: string;
    let customerType: CustomerType;
    const now = Timestamp.now();
    if (!existingCustomerSnap.empty) {
      const cdoc = existingCustomerSnap.docs[0];
      customerId = cdoc.id;
      customerType = (cdoc.data().customerType as CustomerType) ?? "nuevo";
    } else {
      const created = await customersCol.add({
        name: body.customerName, phone: normalizedPhone, rnc: "", email: "", address: body.address ?? "", notes: "",
        customerType: "nuevo", createdAt: now, updatedAt: now,
      });
      customerId = created.id;
      customerType = "nuevo";
    }

    // Protección simple contra doble envío/spam: mismo teléfono + misma
    // cantidad de ítems en los últimos 3 minutos → devolvemos la solicitud ya
    // creada en vez de duplicarla (cubre doble click / reintento de red).
    const threeMinAgo = Timestamp.fromMillis(now.toMillis() - 3 * 60 * 1000);
    const recentSnap = await db.collection("catalogQuotes").doc(workspaceId).collection("records")
      .where("customerPhone", "==", normalizedPhone)
      .where("createdAt", ">=", threeMinAgo)
      .get();
    const duplicate = recentSnap.docs.find((d) => {
      const data = d.data();
      const items = (data.items ?? []) as CatalogQuoteItem[];
      return items.length === quoteItems.length &&
        items.every((it, i) => it.inventoryId === quoteItems[i].inventoryId && it.quantity === quoteItems[i].quantity);
    });
    if (duplicate) {
      return noStore({ ok: true, publicRef: duplicate.data().publicRef });
    }

    const pricing = computeCartPricing(
      quoteItems.map((it) => ({ unitPriceCents: it.unitPriceCents, quantity: it.quantity })),
      { customerType, discountRule: settings.discountRule, advanceRule: settings.advanceRule }
    );

    const publicRef = `${publicRefPrefix(settings.businessName)}-${randomCode(6)}`;

    await db.collection("catalogQuotes").doc(workspaceId).collection("records").add({
      publicRef,
      status: "recibida",
      items: quoteItems,
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      discountPct: pricing.discountPct,
      productsTotalCents: pricing.productsTotalCents,
      deliveryMethod: body.deliveryMethod,
      zone: body.zone ?? null,
      address: body.address ?? null,
      customerName: body.customerName,
      customerPhone: normalizedPhone,
      customerNote: body.note ?? null,
      customerId,
      customerType,
      requiresAdvance: pricing.requiresAdvance,
      advancePct: pricing.advancePct ?? null,
      advanceAmountCents: pricing.advanceAmountCents,
      leadTimeNote: settings.leadTimeNote,
      revision: 1,
      history: [{ action: "recibida", by: "cliente", at: now }],
      createdAt: now,
      updatedAt: now,
    });

    return noStore({ ok: true, publicRef });
  } catch (e) {
    console.error("POST /api/catalogo/[slug]/solicitud error:", e);
    return noStore({ error: "No se pudo enviar la solicitud" }, { status: 500 });
  }
}
