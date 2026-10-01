// Persistencia atómica de una solicitud del catálogo — server-only (Admin SDK).
//
// UNA transacción de Firestore hace, todo o nada:
//   1. deduplicación (misma solicitud repetida en 3 min → devuelve la ya creada),
//   2. buscar o crear el cliente,
//   3. crear la cotización,
//   4. crear el job de aviso de WhatsApp (si corresponde),
//   5. registrar la clave de deduplicación.
//
// Antes la deduplicación era "consultar y después escribir": dos solicitudes
// simultáneas idénticas podían pasar ambas la consulta y crear dos cotizaciones
// (y dos avisos). Con la clave de deduplicación DENTRO de la transacción,
// Firestore serializa los intentos: el segundo relee la clave y devuelve el
// resultado del primero. El cliente nuevo usa un id determinista por teléfono
// para que tampoco se dupliquen clientes.
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { runTx, stageNotificationJob } from "@/lib/whatsappNotificationJob";
import type { CatalogQuoteItem, CustomerType } from "@/types";

export const DEDUP_WINDOW_MS = 3 * 60 * 1000;

export function dedupKey(input: {
  workspaceId: string;
  customerPhone: string;
  items: Pick<CatalogQuoteItem, "inventoryId" | "variantId" | "quantity">[];
  deliveryMethod: string;
  zone?: string | null;
  address?: string | null;
}): string {
  const canonical = JSON.stringify({
    w: input.workspaceId,
    p: input.customerPhone,
    i: input.items.map((it) => [it.inventoryId, it.variantId ?? null, it.quantity]),
    m: input.deliveryMethod,
    z: input.zone ?? null,
    a: input.address ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 40);
}

const customerIdForPhone = (phone: string) => "cat_" + createHash("sha256").update(phone).digest("hex").slice(0, 24);

export interface PersistArgs {
  workspaceId: string;
  normalizedPhone: string;
  customerName: string;
  customerAddress: string;
  items: CatalogQuoteItem[];
  deliveryMethod: string;
  zone?: string | null;
  address?: string | null;
  /** Receptor de la configuración PROTEGIDA (catalogSettings.whatsappNumber) si hay consentimiento; null = no se avisa. */
  notifyRecipient: string | null;
  /** Arma el documento de la cotización una vez resuelto el tipo de cliente (dentro de la transacción). */
  buildQuote: (ctx: { customerId: string; customerType: CustomerType; now: Timestamp }) => { publicRef: string; data: Record<string, unknown> };
}

export type PersistResult =
  | { duplicate: true; publicRef: string; quoteId: string; notify: false }
  | { duplicate: false; publicRef: string; quoteId: string; notify: boolean };

export async function persistCatalogQuote(db: Firestore, args: PersistArgs): Promise<PersistResult> {
  const { workspaceId } = args;
  const key = dedupKey({
    workspaceId, customerPhone: args.normalizedPhone, items: args.items,
    deliveryMethod: args.deliveryMethod, zone: args.zone, address: args.address,
  });
  const dedupRef = db.collection("catalogQuoteDedup").doc(workspaceId).collection("keys").doc(key);
  const customersCol = db.collection("customers").doc(workspaceId).collection("records");
  const quoteRef = db.collection("catalogQuotes").doc(workspaceId).collection("records").doc();

  return runTx(db, async (tx): Promise<PersistResult> => {
    const now = Timestamp.now();

    // 1. ¿Ya existe esta misma solicitud reciente?
    const dedupSnap = await tx.get(dedupRef);
    if (dedupSnap.exists) {
      const d = dedupSnap.data()!;
      const createdAt = d.createdAt as Timestamp | undefined;
      if (createdAt && now.toMillis() - createdAt.toMillis() < DEDUP_WINDOW_MS) {
        return { duplicate: true, publicRef: d.publicRef as string, quoteId: d.quoteId as string, notify: false };
      }
    }

    // 2. Cliente: se hereda customerType si ya existe (el visitante nunca se declara "frecuente").
    const existing = await tx.get(customersCol.where("phone", "==", args.normalizedPhone).limit(1));
    let customerId: string;
    let customerType: CustomerType;
    if (!existing.empty) {
      customerId = existing.docs[0].id;
      customerType = (existing.docs[0].data().customerType as CustomerType) ?? "nuevo";
    } else {
      const newRef = customersCol.doc(customerIdForPhone(args.normalizedPhone));
      const raced = await tx.get(newRef);
      customerId = newRef.id;
      if (raced.exists) {
        customerType = (raced.data()!.customerType as CustomerType) ?? "nuevo";
      } else {
        customerType = "nuevo";
        tx.set(newRef, {
          name: args.customerName, phone: args.normalizedPhone, rnc: "", email: "", address: args.customerAddress, notes: "",
          customerType: "nuevo", createdAt: now, updatedAt: now,
        });
      }
    }

    // 3. Cotización + 4. job de aviso + 5. clave de deduplicación — todo en la misma transacción.
    const { publicRef, data } = args.buildQuote({ customerId, customerType, now });
    tx.set(quoteRef, { ...data, publicRef, customerId, customerType, createdAt: now, updatedAt: now });
    if (args.notifyRecipient) stageNotificationJob(db, tx, workspaceId, quoteRef.id, args.notifyRecipient);
    tx.set(dedupRef, { quoteId: quoteRef.id, publicRef, createdAt: now });

    return { duplicate: false, publicRef, quoteId: quoteRef.id, notify: !!args.notifyRecipient };
  });
}
