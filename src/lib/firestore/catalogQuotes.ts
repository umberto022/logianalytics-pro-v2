import {
  collection, doc, getDoc, getDocs, query, orderBy, updateDoc,
  Timestamp, runTransaction, arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CatalogQuote, CatalogQuoteStatus, CatalogSettings } from "@/types";
import { fromCents } from "@/lib/money";
import { computeCartPricing } from "@/lib/catalogPricing";

const quotesCol = (uid: string) => collection(db, "catalogQuotes", uid, "records");
const quoteDoc = (uid: string, id: string) => doc(db, "catalogQuotes", uid, "records", id);
const invItemDoc = (uid: string, itemId: string) => doc(db, "inventory", uid, "items", itemId);
const salesCol = (uid: string) => collection(db, "sales", uid, "records");
const movCol = (uid: string) => collection(db, "inventoryMovements", uid, "records");

export async function listQuotes(uid: string): Promise<CatalogQuote[]> {
  const q = query(quotesCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CatalogQuote));
}

export async function getQuote(uid: string, quoteId: string): Promise<CatalogQuote | null> {
  const snap = await getDoc(quoteDoc(uid, quoteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CatalogQuote;
}

function fmtBy(by: string) {
  return by || "sistema";
}

/**
 * Preparar/repreparar la cotización: fija envío (o lo deja "por cotizar"),
 * recalcula descuento/anticipo con la MISMA función que usó la solicitud
 * pública (computeCartPricing), e incrementa `revision`. Si el cliente ya
 * había aceptado una revisión anterior, `acceptedVersion` queda vieja a
 * propósito — la UI debe mostrar "el cliente aceptó la versión N, esta es la M".
 */
export async function prepareQuote(
  uid: string,
  quoteId: string,
  params: { shippingCents?: number; settings: CatalogSettings; by: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    const quote = await getQuote(uid, quoteId);
    if (!quote) return { ok: false, message: "Solicitud no encontrada" };

    const pricing = computeCartPricing(
      quote.items.map((it) => ({ unitPriceCents: it.unitPriceCents, quantity: it.quantity })),
      {
        customerType: quote.customerType,
        discountRule: params.settings.discountRule,
        advanceRule: params.settings.advanceRule,
        shippingCents: params.shippingCents,
      }
    );

    await updateDoc(quoteDoc(uid, quoteId), {
      shippingCents: pricing.shippingCents ?? null,
      totalCents: pricing.totalCents ?? null,
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      discountPct: pricing.discountPct,
      productsTotalCents: pricing.productsTotalCents,
      requiresAdvance: pricing.requiresAdvance,
      advancePct: pricing.advancePct ?? null,
      advanceAmountCents: pricing.advanceAmountCents,
      balanceDueCents: pricing.balanceDueCents ?? null,
      status: "preparada" as CatalogQuoteStatus,
      revision: (quote.revision ?? 1) + 1,
      updatedAt: Timestamp.now(),
      history: arrayUnion({
        action: "preparada", by: fmtBy(params.by), at: Timestamp.now(),
        note: pricing.shippingCents !== undefined ? "Envío cotizado" : "Envío pendiente",
      }),
    });
    return { ok: true, message: "Cotización preparada" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/** Marca que Stefany abrió/envió el mensaje de WhatsApp — acción manual explícita, nunca automática. */
export async function markQuoteSent(uid: string, quoteId: string, by: string): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(quoteDoc(uid, quoteId), {
      status: "enviada" as CatalogQuoteStatus,
      updatedAt: Timestamp.now(),
      history: arrayUnion({ action: "enviada", by: fmtBy(by), at: Timestamp.now() }),
    });
    return { ok: true, message: "Marcada como enviada" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

export async function markQuoteAccepted(uid: string, quoteId: string, by: string): Promise<{ ok: boolean; message: string }> {
  try {
    const quote = await getQuote(uid, quoteId);
    if (!quote) return { ok: false, message: "Solicitud no encontrada" };
    const nextStatus: CatalogQuoteStatus = quote.requiresAdvance ? "pendiente_anticipo" : "aceptada";
    await updateDoc(quoteDoc(uid, quoteId), {
      status: nextStatus,
      acceptedVersion: quote.revision,
      updatedAt: Timestamp.now(),
      history: arrayUnion({ action: "aceptada", by: fmtBy(by), at: Timestamp.now(), note: `Versión ${quote.revision}` }),
    });
    return { ok: true, message: "Aceptación registrada" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

export async function registerQuoteAdvance(
  uid: string,
  quoteId: string,
  params: { amountCents: number; method?: string; note?: string; by: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    const quote = await getQuote(uid, quoteId);
    if (!quote) return { ok: false, message: "Solicitud no encontrada" };
    const paidSoFar = (quote.payments ?? []).reduce((s, p) => s + p.amountCents, 0) + params.amountCents;
    const advanceMet = quote.advanceAmountCents !== undefined && paidSoFar >= quote.advanceAmountCents;

    await updateDoc(quoteDoc(uid, quoteId), {
      payments: arrayUnion({
        amountCents: params.amountCents, method: params.method ?? "", note: params.note ?? "",
        recordedBy: fmtBy(params.by), recordedAt: Timestamp.now(),
      }),
      ...(advanceMet ? { status: "confirmado" as CatalogQuoteStatus } : {}),
      updatedAt: Timestamp.now(),
      history: arrayUnion({
        action: "anticipo_registrado", by: fmtBy(params.by), at: Timestamp.now(),
        note: `${params.method ?? ""} ${params.note ?? ""}`.trim() || "",
      }),
    });
    return { ok: true, message: advanceMet ? "Anticipo registrado — pedido confirmado" : "Anticipo registrado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

/** Confirmar sin anticipo (pago contra entrega — cliente frecuente sin pedido grande). */
export async function markQuoteConfirmed(uid: string, quoteId: string, by: string): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(quoteDoc(uid, quoteId), {
      status: "confirmado" as CatalogQuoteStatus,
      updatedAt: Timestamp.now(),
      history: arrayUnion({ action: "confirmado", by: fmtBy(by), at: Timestamp.now() }),
    });
    return { ok: true, message: "Pedido confirmado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

export async function cancelQuote(uid: string, quoteId: string, by: string, note?: string): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(quoteDoc(uid, quoteId), {
      status: "cancelada" as CatalogQuoteStatus,
      updatedAt: Timestamp.now(),
      history: arrayUnion({ action: "cancelada", by: fmtBy(by), at: Timestamp.now(), note: note ?? "" }),
    });
    return { ok: true, message: "Solicitud cancelada" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

function fmtCurrency(v: number) {
  return v.toLocaleString("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2 });
}

/**
 * Convierte una cotización confirmada en Venta dentro de una TRANSACCIÓN
 * (a diferencia de sales.ts, que hace getDoc+batch) para que:
 *  - Doble click / doble conversión no dupliquen la venta ni descuenten stock
 *    dos veces: el chequeo `status === 'convertida'` y la escritura ocurren
 *    atómicamente.
 *  - Se revalide disponibilidad real al momento de confirmar, no la del
 *    momento en que se pidió la cotización.
 *
 * SIN conversión parcial: si CUALQUIER ítem (haya sido marcado "por encargo"
 * al pedir la cotización, o le haya bajado el stock después) no tiene
 * existencias suficientes en este momento, la conversión entera se rechaza
 * — no se crea ninguna venta, no se toca el inventario. Se probó la
 * alternativa de vender solo los ítems listos y dejar el resto pendiente,
 * pero repartir descuento/anticipo/saldo entre dos ventas (la actual y una
 * futura, cuando llegue el stock) sin duplicar montos requeriría un
 * mini-módulo de "pedido parcial" nuevo — fuera del alcance de esta primera
 * versión. La solución más simple que mantiene los importes siempre
 * correctos es: todo o nada. Stefany reintenta cuando tenga stock del
 * producto faltante (Inventario), o cancela la solicitud si no lo va a
 * conseguir.
 *
 * También exige que el envío ya esté cotizado (quote.totalCents definido) —
 * no se puede fijar `paymentStatus`/saldo de una venta con un total a medias.
 */
export async function convertQuoteToSale(
  uid: string,
  quoteId: string,
  params: { by: string }
): Promise<{ ok: boolean; message: string; saleOrderId?: string }> {
  try {
    const saleOrderId = doc(salesCol(uid)).id;

    const result = await runTransaction(db, async (tx) => {
      const qRef = quoteDoc(uid, quoteId);
      const qSnap = await tx.get(qRef);
      if (!qSnap.exists()) throw new Error("Solicitud no encontrada");
      const quote = qSnap.data() as CatalogQuote;

      if (quote.status === "convertida") {
        return { alreadyConverted: true as const, saleOrderId: quote.saleOrderId };
      }
      if (quote.status !== "confirmado") {
        throw new Error(`La solicitud debe estar "confirmado" antes de convertir (estado actual: ${quote.status})`);
      }
      if (quote.totalCents === undefined) {
        throw new Error(`Falta cotizar el envío antes de convertir — el total todavía está "por cotizar".`);
      }

      // Leer TODOS los productos involucrados antes de escribir nada (regla de Firestore transactions).
      const itemRefs = quote.items.map((it) => invItemDoc(uid, it.inventoryId));
      const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

      const insufficient: string[] = [];
      for (let i = 0; i < quote.items.length; i++) {
        const snap = itemSnaps[i];
        const it = quote.items[i];
        if (!snap.exists()) { insufficient.push(`"${it.productName}" ya no existe en inventario`); continue; }
        const stock = snap.data()!.currentStock as number;
        if (stock < it.quantity) insufficient.push(`"${it.productName}" (disponible ${stock}, pedido ${it.quantity})`);
      }
      if (insufficient.length > 0) {
        throw new Error(
          `No se puede convertir: falta stock de ${insufficient.join(", ")}. Reponé el inventario y reintentá, o cancelá/ajustá la solicitud — no se vende parcialmente para no descuadrar el descuento y el anticipo.`
        );
      }

      const now = Timestamp.now();
      const d = now.toDate();
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const invoiceNumber = `FAC-${yy}${mm}${dd}-${saleOrderId.slice(-4).toUpperCase()}`;

      // El saldo ya cobrado (anticipo) NO se vuelve a registrar como un pago
      // aparte acá — es el MISMO monto que ya vive en quote.payments[], solo
      // se refleja en la venta para que Cuentas por Cobrar sepa cuánto falta.
      const balanceDueCents = quote.balanceDueCents ?? 0;
      // "credito" (no "pendiente") para que aparezca en Cuentas por Cobrar y
      // Stefany pueda cerrarla ahí con el flujo habitual — "pendiente" queda
      // fuera de esa pantalla (ver cuentas-por-cobrar/page.tsx) y el saldo se
      // habría perdido de vista. Sin dueDate: el saldo es contra entrega, sin
      // fecha de vencimiento fija que podamos prometer.
      const paymentStatus = balanceDueCents > 0 ? "credito" : "pagado";

      for (let i = 0; i < quote.items.length; i++) {
        const it = quote.items[i];
        const snap = itemSnaps[i];
        const data = snap.data()!;
        const unitCost = data.unitCost as number;
        const unitPrice = fromCents(it.unitPriceCents);
        const totalRevenue = it.quantity * unitPrice;
        const totalCost = it.quantity * unitCost;

        const saleRef = doc(salesCol(uid));
        tx.set(saleRef, {
          saleOrderId, invoiceNumber,
          inventoryId: it.inventoryId, sku: it.sku, productName: it.productName, category: it.category,
          quantity: it.quantity, unitPrice, unitCost,
          route: quote.deliveryMethod === "retiro" ? "Retiro en tienda" : `Entrega - ${quote.zone ?? ""}`,
          zone: quote.zone ?? (quote.deliveryMethod === "retiro" ? "Retiro" : ""),
          client: quote.customerName,
          clientPhone: quote.customerPhone,
          clientAddress: quote.address ?? "",
          notes: [it.variantLabel, quote.customerNote].filter(Boolean).join(" · "),
          paymentStatus,
          saleDate: now,
          totalRevenue, totalCost, profit: totalRevenue - totalCost,
          quoteId,
          advanceAmountCents: quote.advanceAmountCents ?? 0,
          balanceDueCents,
          deliveryStatus: "pendiente",
        });

        tx.update(itemRefs[i], { currentStock: Math.max(0, (data.currentStock as number) - it.quantity), updatedAt: now });
        tx.set(doc(movCol(uid)), {
          inventoryId: it.inventoryId, sku: it.sku, productName: it.productName,
          movementType: "sale", quantity: -it.quantity,
          reference: `Catálogo ${saleOrderId.slice(-6)}`,
          note: `${it.productName} x${it.quantity} @ ${fmtCurrency(unitPrice)} (solicitud ${quote.publicRef})`,
          createdAt: now,
        });
      }

      tx.update(qRef, {
        status: "convertida" as CatalogQuoteStatus,
        saleOrderId,
        updatedAt: now,
        history: arrayUnion({
          action: "convertida", by: fmtBy(params.by), at: now,
          note: `${quote.items.length} ítem(s) vendidos`,
        }),
      });

      return { alreadyConverted: false as const, saleOrderId };
    });

    if (result.alreadyConverted) {
      return { ok: true, message: "Esta solicitud ya había sido convertida a venta.", saleOrderId: result.saleOrderId };
    }
    return { ok: true, message: "Venta registrada a partir de la solicitud.", saleOrderId: result.saleOrderId };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
