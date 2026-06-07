import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  Timestamp, writeBatch, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { InventoryItem, InventoryMovement } from "@/types";
import { generateSku } from "@/lib/utils";

const itemsCol = (uid: string) =>
  collection(db, "inventory", uid, "items");

const movementsCol = (uid: string) =>
  collection(db, "inventoryMovements", uid, "records");

export async function listInventory(uid: string): Promise<InventoryItem[]> {
  const snap = await getDocs(itemsCol(uid));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as InventoryItem))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function addInventoryItem(
  uid: string,
  data: Omit<InventoryItem, "id" | "sku" | "updatedAt">
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const sku = generateSku(data.category, data.name);
    const now = Timestamp.now();
    const ref = await addDoc(itemsCol(uid), { ...data, sku, updatedAt: now });

    if (data.currentStock > 0) {
      await addDoc(movementsCol(uid), {
        inventoryId: ref.id,
        sku,
        productName: data.name,
        movementType: "purchase",
        quantity: data.currentStock,
        reference: "",
        note: "Stock inicial",
        createdAt: now,
      });
    }
    return { ok: true, message: `'${data.name}' agregado`, id: ref.id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}

export async function updateInventoryItem(
  uid: string,
  itemId: string,
  data: Partial<Omit<InventoryItem, "id" | "sku">>
): Promise<{ ok: boolean; message: string }> {
  try {
    const ref = doc(itemsCol(uid), itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Producto no encontrado" };

    const prev = snap.data() as InventoryItem;
    const now = Timestamp.now();

    if (data.currentStock !== undefined && data.currentStock !== prev.currentStock) {
      const diff = data.currentStock - prev.currentStock;
      await addDoc(movementsCol(uid), {
        inventoryId: itemId,
        sku: prev.sku,
        productName: prev.name,
        movementType: diff > 0 ? "purchase" : "adjustment",
        quantity: diff,
        reference: "",
        note: "Ajuste manual",
        createdAt: now,
      });
    }

    await updateDoc(ref, { ...data, updatedAt: now });
    return { ok: true, message: "Actualizado" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}

export async function deleteInventoryItem(
  uid: string,
  itemId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteDoc(doc(itemsCol(uid), itemId));
    return { ok: true, message: "Eliminado" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, message: msg };
  }
}

export async function bulkAddInventory(
  uid: string,
  rows: Omit<InventoryItem, "id" | "sku" | "updatedAt">[]
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  const CHUNK = 400;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = writeBatch(db);
    const chunk = rows.slice(i, i + CHUNK);
    chunk.forEach((row) => {
      const sku = generateSku(row.category, row.name);
      const ref = doc(itemsCol(uid));
      batch.set(ref, { ...row, sku, updatedAt: Timestamp.now() });
      imported++;
    });
    try {
      await batch.commit();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de batch";
      errors.push(msg);
      imported -= chunk.length;
    }
  }
  return { imported, errors };
}

export async function listMovements(
  uid: string,
  days: number
): Promise<InventoryMovement[]> {
  const since = Timestamp.fromDate(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );
  const snap = await getDocs(movementsCol(uid));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as InventoryMovement))
    .filter((m) => m.createdAt >= since)
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function adjustStock(
  uid: string,
  itemId: string,
  delta: number,
  note: string,
  type: InventoryMovement["movementType"],
  extra?: { serialNumber?: string; batchCode?: string; receiptPhotoUrl?: string; reference?: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    const ref = doc(itemsCol(uid), itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Producto no encontrado" };
    const prev = snap.data() as InventoryItem;
    const newStock = Math.max(0, prev.currentStock + delta);
    const now = Timestamp.now();
    await updateDoc(ref, { currentStock: newStock, updatedAt: now });
    await addDoc(movementsCol(uid), {
      inventoryId: itemId,
      sku: prev.sku,
      productName: prev.name,
      movementType: type,
      quantity: delta,
      reference: extra?.reference ?? "",
      note,
      serialNumber: extra?.serialNumber ?? "",
      batchCode: extra?.batchCode ?? "",
      receiptPhotoUrl: extra?.receiptPhotoUrl ?? "",
      createdAt: now,
    });
    return { ok: true, message: `Stock actualizado: ${newStock} unidades` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}
