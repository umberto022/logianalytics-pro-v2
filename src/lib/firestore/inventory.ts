import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, arrayUnion,
  Timestamp, writeBatch, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { InventoryItem, InventoryMovement, PriceHistoryEntry } from "@/types";
import { generateSku } from "@/lib/utils";
import { logAudit } from "./auditLog";

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
    void logAudit(uid, "inventory_add", ref.id, data.name, `Stock inicial: ${data.currentStock}`);
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

    const priceChanged =
      (data.unitCost !== undefined && data.unitCost !== prev.unitCost) ||
      (data.salePrice !== undefined && data.salePrice !== prev.salePrice);

    const priceEntry: PriceHistoryEntry | null = priceChanged
      ? { date: now, unitCost: data.unitCost ?? prev.unitCost, salePrice: data.salePrice ?? prev.salePrice }
      : null;

    await updateDoc(ref, {
      ...data,
      updatedAt: now,
      ...(priceEntry ? { priceHistory: arrayUnion(priceEntry) } : {}),
    });
    void logAudit(uid, "inventory_update", itemId, prev.name, priceChanged ? "Precios actualizados" : "Datos actualizados");
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
    const snap = await getDoc(doc(itemsCol(uid), itemId));
    const name = snap.exists() ? (snap.data() as InventoryItem).name : itemId;
    await deleteDoc(doc(itemsCol(uid), itemId));
    void logAudit(uid, "inventory_delete", itemId, name, "Producto eliminado");
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
  const q = query(
    movementsCol(uid),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryMovement));
}

export async function listMovementsByRange(
  uid: string,
  from: Date,
  to: Date
): Promise<InventoryMovement[]> {
  const q = query(
    movementsCol(uid),
    where("createdAt", ">=", Timestamp.fromDate(from)),
    where("createdAt", "<=", Timestamp.fromDate(to)),
    orderBy("createdAt", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryMovement));
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
    void logAudit(uid, "stock_adjust", itemId, prev.name, `${type}: ${delta > 0 ? "+" : ""}${delta} → ${newStock} uds. ${note ? `(${note})` : ""}`);
    return { ok: true, message: `Stock actualizado: ${newStock} unidades` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}
