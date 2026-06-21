import {
  collection, doc, getDocs, query, orderBy,
  limit as fsLimit, Timestamp, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ConteoItem {
  inventoryId: string;
  sku:         string;
  productName: string;
  systemQty:   number;
  countedQty:  number;
  diff:        number;
}

export interface ConteoRecord {
  id:            string;
  createdAt:     Timestamp;
  totalProducts: number;
  adjustedItems: number;
  items:         ConteoItem[];
}

const conteoCol = (uid: string) =>
  collection(db, "conteos", uid, "records");

export async function getLastConteo(uid: string): Promise<ConteoRecord | null> {
  const snap = await getDocs(
    query(conteoCol(uid), orderBy("createdAt", "desc"), fsLimit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as ConteoRecord;
}

export async function getRecentConteos(uid: string): Promise<ConteoRecord[]> {
  const snap = await getDocs(
    query(conteoCol(uid), orderBy("createdAt", "desc"), fsLimit(8))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConteoRecord));
}

export async function submitConteo(uid: string, items: ConteoItem[]): Promise<void> {
  const batch = writeBatch(db);
  const adjusted = items.filter((i) => i.diff !== 0);

  for (const item of adjusted) {
    // Update inventory stock
    batch.update(doc(db, "inventory", uid, "items", item.inventoryId), {
      currentStock: item.countedQty,
      updatedAt: Timestamp.now(),
    });
    // Log movement
    batch.set(doc(collection(db, "inventoryMovements", uid, "records")), {
      inventoryId:  item.inventoryId,
      sku:          item.sku,
      productName:  item.productName,
      quantity:     item.diff,
      movementType: "adjustment",
      note:         "Ajuste por conteo físico",
      createdAt:    Timestamp.now(),
    });
  }

  // Save conteo record
  batch.set(doc(conteoCol(uid)), {
    createdAt:     Timestamp.now(),
    totalProducts: items.length,
    adjustedItems: adjusted.length,
    items,
  });

  await batch.commit();
}
