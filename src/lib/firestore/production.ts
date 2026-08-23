import {
  collection, doc, getDocs, query, where, orderBy, limit,
  Timestamp, runTransaction, arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  InventoryItem, RawMaterial, PriceHistoryEntry,
  ProductionRecord, ProductionConsumedItem,
} from "@/types";
import { logAudit } from "./auditLog";

const recordsCol = (workspaceId: string) => collection(db, "users", workspaceId, "productionRecords");
const itemsCol    = (workspaceId: string) => collection(db, "inventory", workspaceId, "items");
const rawCol      = (workspaceId: string) => collection(db, "users", workspaceId, "rawMaterials");
const rawMovCol   = (workspaceId: string) => collection(db, "users", workspaceId, "rawMaterialMovements");
const invMovCol   = (workspaceId: string) => collection(db, "inventoryMovements", workspaceId, "records");

export interface ProductionInput {
  inventoryId: string;
  quantityProduced: number;
  consumed: { rawMaterialId: string; quantityUsed: number }[];
  laborCost: number;
  otherCosts: number;
  note: string;
}

/**
 * Registra una tanda de producción: consume insumos (resta su stock), aumenta
 * el stock del producto terminado, y recalcula su `unitCost` real a partir de lo
 * que de verdad se gastó (insumos + mano de obra + otros costos) / unidades producidas.
 * Sin motor de "receta" — cada tanda declara a mano qué se usó, a pedido del usuario.
 * Todo corre en una transacción para que el stock de insumos y de producto queden
 * consistentes aunque falle a mitad de camino.
 */
export async function registerProduction(
  workspaceId: string,
  input: ProductionInput
): Promise<{ ok: boolean; message: string }> {
  try {
    if (input.quantityProduced <= 0) {
      return { ok: false, message: "La cantidad producida debe ser mayor a 0" };
    }
    if (input.consumed.length === 0) {
      return { ok: false, message: "Agrega al menos un insumo consumido" };
    }

    // Si el mismo insumo aparece en más de una fila, se fusiona sumando cantidades —
    // evita que dos tx.update() sobre el mismo doc se pisen entre sí (el segundo
    // ganaría y el descuento de stock del primero se perdería).
    const mergedMap = new Map<string, number>();
    for (const c of input.consumed) {
      mergedMap.set(c.rawMaterialId, (mergedMap.get(c.rawMaterialId) ?? 0) + c.quantityUsed);
    }
    const consumed = Array.from(mergedMap, ([rawMaterialId, quantityUsed]) => ({ rawMaterialId, quantityUsed }));

    const now = Timestamp.now();
    const invRef = doc(itemsCol(workspaceId), input.inventoryId);
    const rawRefs = consumed.map((c) => doc(rawCol(workspaceId), c.rawMaterialId));

    const result = await runTransaction(db, async (tx) => {
      // ── Lecturas (todas antes de cualquier escritura) ──
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error("Producto no encontrado");
      const invData = invSnap.data() as InventoryItem;

      const rawSnaps = await Promise.all(rawRefs.map((r) => tx.get(r)));
      const consumedItems: ProductionConsumedItem[] = [];

      rawSnaps.forEach((snap, i) => {
        const c = consumed[i];
        if (!snap.exists()) throw new Error("Un insumo seleccionado ya no existe");
        const raw = snap.data() as RawMaterial;
        if (raw.currentStock < c.quantityUsed) {
          throw new Error(
            `Stock insuficiente de "${raw.name}": disponible ${raw.currentStock} ${raw.unit}, se necesitan ${c.quantityUsed}`
          );
        }
        consumedItems.push({
          rawMaterialId: c.rawMaterialId,
          rawMaterialName: raw.name,
          unit: raw.unit,
          quantityUsed: c.quantityUsed,
          unitCost: raw.unitCost,
          totalCost: raw.unitCost * c.quantityUsed,
        });
      });

      const materialsCost = consumedItems.reduce((s, c) => s + c.totalCost, 0);
      const totalCost = materialsCost + input.laborCost + input.otherCosts;
      const costPerUnit = totalCost / input.quantityProduced;

      // ── Escrituras ──
      rawSnaps.forEach((snap, i) => {
        const raw = snap.data() as RawMaterial;
        const c = consumed[i];
        tx.update(rawRefs[i], { currentStock: raw.currentStock - c.quantityUsed, updatedAt: now });
      });

      const priceEntry: PriceHistoryEntry = { date: now, unitCost: costPerUnit, salePrice: invData.salePrice };
      tx.update(invRef, {
        currentStock: invData.currentStock + input.quantityProduced,
        unitCost: costPerUnit,
        updatedAt: now,
        priceHistory: arrayUnion(priceEntry),
      });

      const record: Omit<ProductionRecord, "id"> = {
        inventoryId: input.inventoryId,
        sku: invData.sku,
        productName: invData.name,
        quantityProduced: input.quantityProduced,
        consumedItems,
        materialsCost,
        laborCost: input.laborCost,
        otherCosts: input.otherCosts,
        totalCost,
        costPerUnit,
        note: input.note,
        createdAt: now,
      };
      tx.set(doc(recordsCol(workspaceId)), record);

      consumedItems.forEach((c) => {
        tx.set(doc(rawMovCol(workspaceId)), {
          rawMaterialId: c.rawMaterialId,
          rawMaterialName: c.rawMaterialName,
          movementType: "produccion",
          quantity: -c.quantityUsed,
          reference: `Producción: ${invData.name}`,
          note: input.note,
          createdAt: now,
        });
      });

      tx.set(doc(invMovCol(workspaceId)), {
        inventoryId: input.inventoryId,
        sku: invData.sku,
        productName: invData.name,
        movementType: "production",
        quantity: input.quantityProduced,
        reference: "",
        note: `Producción propia — costo real ${costPerUnit.toFixed(2)}/u`,
        createdAt: now,
      });

      return { costPerUnit, productName: invData.name };
    });

    void logAudit(
      workspaceId, "production_register", input.inventoryId, result.productName,
      `${input.quantityProduced} uds. producidas, costo real ${result.costPerUnit.toFixed(2)}/u`
    );
    return {
      ok: true,
      message: `Producción registrada: ${input.quantityProduced} uds. a ${result.costPerUnit.toFixed(2)}/u`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}

export async function listProductionRecords(workspaceId: string, days = 90): Promise<ProductionRecord[]> {
  try {
    const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    const q = query(
      recordsCol(workspaceId),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionRecord));
  } catch {
    return [];
  }
}
