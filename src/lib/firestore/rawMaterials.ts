import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, arrayUnion,
  Timestamp, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RawMaterial, RawMaterialMovement, RawMaterialPriceHistoryEntry } from "@/types";
import { logAudit } from "./auditLog";

const col = (workspaceId: string) => collection(db, "users", workspaceId, "rawMaterials");
const movementsCol = (workspaceId: string) => collection(db, "users", workspaceId, "rawMaterialMovements");

export async function listRawMaterials(workspaceId: string): Promise<RawMaterial[]> {
  try {
    const snap = await getDocs(query(col(workspaceId), orderBy("name", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterial));
  } catch {
    return [];
  }
}

export async function addRawMaterial(
  workspaceId: string,
  data: Omit<RawMaterial, "id" | "updatedAt">
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const now = Timestamp.now();
    const ref = await addDoc(col(workspaceId), { ...data, updatedAt: now });
    if (data.currentStock > 0) {
      await addDoc(movementsCol(workspaceId), {
        rawMaterialId: ref.id,
        rawMaterialName: data.name,
        movementType: "ajuste",
        quantity: data.currentStock,
        reference: "",
        note: "Stock inicial",
        createdAt: now,
      });
    }
    void logAudit(workspaceId, "raw_material_add", ref.id, data.name, `Stock inicial: ${data.currentStock} ${data.unit}`);
    return { ok: true, message: `Insumo "${data.name}" agregado`, id: ref.id };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function updateRawMaterial(
  workspaceId: string,
  id: string,
  data: Partial<Omit<RawMaterial, "id" | "updatedAt">>
): Promise<{ ok: boolean; message: string }> {
  try {
    const ref = doc(col(workspaceId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Insumo no encontrado" };
    const prev = snap.data() as RawMaterial;
    const now = Timestamp.now();

    if (data.currentStock !== undefined && data.currentStock !== prev.currentStock) {
      const diff = data.currentStock - prev.currentStock;
      await addDoc(movementsCol(workspaceId), {
        rawMaterialId: id,
        rawMaterialName: prev.name,
        movementType: "ajuste",
        quantity: diff,
        reference: "",
        note: "Ajuste manual",
        createdAt: now,
      });
    }

    const costChanged = data.unitCost !== undefined && data.unitCost !== prev.unitCost;
    const priceEntry: RawMaterialPriceHistoryEntry | null = costChanged
      ? { date: now, unitCost: data.unitCost as number }
      : null;

    await updateDoc(ref, {
      ...data,
      updatedAt: now,
      ...(priceEntry ? { priceHistory: arrayUnion(priceEntry) } : {}),
    });
    void logAudit(workspaceId, "raw_material_update", id, prev.name, costChanged ? "Costo actualizado" : "Datos actualizados");
    return { ok: true, message: "Insumo actualizado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function deleteRawMaterial(
  workspaceId: string,
  id: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const snap = await getDoc(doc(col(workspaceId), id));
    const name = snap.exists() ? (snap.data() as RawMaterial).name : id;
    await deleteDoc(doc(col(workspaceId), id));
    void logAudit(workspaceId, "raw_material_delete", id, name, "Insumo eliminado");
    return { ok: true, message: "Insumo eliminado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

export async function adjustRawMaterialStock(
  workspaceId: string,
  id: string,
  delta: number,
  note: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const ref = doc(col(workspaceId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Insumo no encontrado" };
    const prev = snap.data() as RawMaterial;
    const newStock = Math.max(0, prev.currentStock + delta);
    const now = Timestamp.now();
    await updateDoc(ref, { currentStock: newStock, updatedAt: now });
    await addDoc(movementsCol(workspaceId), {
      rawMaterialId: id,
      rawMaterialName: prev.name,
      movementType: "ajuste",
      quantity: delta,
      reference: "",
      note,
      createdAt: now,
    });
    void logAudit(
      workspaceId, "raw_material_stock_adjust", id, prev.name,
      `${delta > 0 ? "+" : ""}${delta} → ${newStock} ${prev.unit}. ${note ? `(${note})` : ""}`
    );
    return { ok: true, message: `Stock actualizado: ${newStock} ${prev.unit}` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function listRawMaterialMovements(workspaceId: string, days = 90): Promise<RawMaterialMovement[]> {
  try {
    const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    const q = query(
      movementsCol(workspaceId),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterialMovement));
  } catch {
    return [];
  }
}
