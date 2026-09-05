import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  Timestamp, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types";
import { adjustStock } from "./inventory";
import { adjustRawMaterialStock, addRawMaterial } from "./rawMaterials";
import { logAudit } from "./auditLog";

const ordersCol = (uid: string) =>
  collection(db, "purchaseOrders", uid, "orders");

function generateOrderNumber(): string {
  const now = new Date();
  const y   = now.getFullYear().toString().slice(-2);
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `OC-${y}${m}${d}-${rand}`;
}

export async function listPurchaseOrders(uid: string): Promise<PurchaseOrder[]> {
  const snap = await getDocs(ordersCol(uid));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function createPurchaseOrder(
  uid: string,
  data: Omit<PurchaseOrder, "id" | "orderNumber" | "createdAt" | "updatedAt">
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const now = Timestamp.now();
    const ref = await addDoc(ordersCol(uid), {
      ...data,
      orderNumber: generateOrderNumber(),
      createdAt: now,
      updatedAt: now,
    });
    void logAudit(uid, "purchase_create", ref.id, data.supplierName, `${data.items.length} ${data.orderType === "insumo" ? "insumos" : "productos"} · Total: ${data.total}`);
    return { ok: true, message: "Orden creada", id: ref.id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}

export async function updatePurchaseOrder(
  uid: string,
  orderId: string,
  data: Partial<Omit<PurchaseOrder, "id" | "orderNumber" | "createdAt">>
): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(doc(ordersCol(uid), orderId), { ...data, updatedAt: Timestamp.now() });
    return { ok: true, message: "Orden actualizada" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, message: msg };
  }
}

export async function receivePurchaseOrder(
  uid: string,
  orderId: string,
  receivedItems: PurchaseOrderItem[]
): Promise<{ ok: boolean; message: string }> {
  try {
    const ref  = doc(ordersCol(uid), orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Orden no encontrada" };

    const order = snap.data() as PurchaseOrder;
    const isInsumo = order.orderType === "insumo";

    const allFull = receivedItems.every((i) => i.qtyReceived >= i.qtyOrdered);
    const status  = allFull ? "recibida" : "parcial";

    // "Editar" solo está disponible mientras la orden está "pendiente" (ver compras/page.tsx),
    // así que una vez que empieza a recibirse, order.items ya no cambia de tamaño/orden entre
    // recepciones parciales — alinear por índice contra el snapshot recién leído es seguro.
    const finalItems: PurchaseOrderItem[] = [];
    for (let idx = 0; idx < receivedItems.length; idx++) {
      const item = receivedItems[idx];
      // qtyReceived es acumulado (puede venir de varios envíos parciales) — el delta real a
      // sumar al stock es solo lo que se recibió DESDE la última vez, no el total acumulado.
      const prevQtyReceived = order.items[idx]?.qtyReceived ?? 0;
      const delta = item.qtyReceived - prevQtyReceived;
      let resolved = item;

      if (delta > 0) {
        if (isInsumo) {
          // Reabastece el insumo (materia prima), no el Inventario de producto terminado.
          const note = `Recepción OC ${order.orderNumber}${item.batchCode ? ` · Lote ${item.batchCode}` : ""}`;
          if (item.isNewRawMaterial) {
            // Insumo agregado libremente al armar la orden (no existía en rawMaterials) — se crea recién ahora.
            const created = await addRawMaterial(uid, {
              name: item.productName,
              unit: item.unit || "unidad",
              unitCost: item.unitCost,
              currentStock: 0,
              minStock: 0,
              supplier: order.supplierName,
              notes: `Creado automáticamente al recibir OC ${order.orderNumber}`,
            });
            if (created.ok && created.id) {
              await adjustRawMaterialStock(uid, created.id, delta, note, "compra", order.orderNumber);
              resolved = { ...item, inventoryId: created.id, isNewRawMaterial: false };
            }
          } else {
            await adjustRawMaterialStock(uid, item.inventoryId, delta, note, "compra", order.orderNumber);
          }
        } else {
          await adjustStock(uid, item.inventoryId, delta,
            `Recepción OC ${order.orderNumber}`, "purchase", {
              serialNumber: item.serialNumber,
              batchCode: item.batchCode,
              receiptPhotoUrl: item.receiptPhotoUrl,
              reference: order.orderNumber,
            });
        }
      }
      finalItems.push(resolved);
    }

    await updateDoc(ref, {
      status,
      items: finalItems,
      receivedDate: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    void logAudit(uid, "purchase_receive", orderId, order.supplierName, `Estado: ${status} · ${finalItems.length} ${isInsumo ? "insumos" : "productos"} recibidos`);
    return { ok: true, message: `Orden marcada como ${status}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, message: msg };
  }
}

export async function deletePurchaseOrder(
  uid: string,
  orderId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteDoc(doc(ordersCol(uid), orderId));
    return { ok: true, message: "Orden eliminada" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, message: msg };
  }
}
