import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  Timestamp, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types";
import { adjustStock } from "./inventory";
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
    void logAudit(uid, "purchase_create", ref.id, data.supplierName, `${data.items.length} productos · Total: ${data.total}`);
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

    const allFull = receivedItems.every((i) => i.qtyReceived >= i.qtyOrdered);
    const status  = allFull ? "recibida" : "parcial";

    for (const item of receivedItems) {
      if (item.qtyReceived > 0) {
        await adjustStock(uid, item.inventoryId, item.qtyReceived,
          `Recepción OC ${snap.data().orderNumber}`, "purchase", {
            serialNumber: item.serialNumber,
            batchCode: item.batchCode,
            receiptPhotoUrl: item.receiptPhotoUrl,
            reference: snap.data().orderNumber,
          });
      }
    }

    await updateDoc(ref, {
      status,
      items: receivedItems,
      receivedDate: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    void logAudit(uid, "purchase_receive", orderId, snap.data().supplierName, `Estado: ${status} · ${receivedItems.length} productos recibidos`);
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
