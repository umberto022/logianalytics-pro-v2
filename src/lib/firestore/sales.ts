import {
  collection, doc, addDoc, getDocs, query, orderBy,
  Timestamp, updateDoc, getDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Sale, SalesSummary, RouteStats, ProductStats, DailyStat, ClientStats, PaymentStatus,
} from "@/types";
import { format } from "date-fns";

const salesCol = (uid: string) => collection(db, "sales", uid, "records");
const invItemDoc = (uid: string, itemId: string) =>
  doc(db, "inventory", uid, "items", itemId);
const movCol = (uid: string) =>
  collection(db, "inventoryMovements", uid, "records");

export async function registerSale(
  uid: string,
  params: {
    inventoryId: string;
    quantity: number;
    unitPrice: number;
    route: string;
    zone: string;
    client: string;
    saleDate: Date;
  }
): Promise<{ ok: boolean; message: string }> {
  try {
    const itemRef = invItemDoc(uid, params.inventoryId);
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) return { ok: false, message: "Producto no encontrado" };

    const item = itemSnap.data();
    const { sku, name, category, unitCost, currentStock } = item;

    if (currentStock < params.quantity)
      return {
        ok: false,
        message: `Stock insuficiente: disponible ${currentStock}, solicitado ${params.quantity}`,
      };

    const totalRevenue = params.quantity * params.unitPrice;
    const totalCost    = params.quantity * unitCost;
    const profit       = totalRevenue - totalCost;
    const now          = Timestamp.now();
    const saleTs       = Timestamp.fromDate(params.saleDate);

    const batch = writeBatch(db);

    // Record the sale
    const saleRef = doc(salesCol(uid));
    batch.set(saleRef, {
      inventoryId:  params.inventoryId,
      sku,
      productName:  name,
      category,
      quantity:     params.quantity,
      unitPrice:    params.unitPrice,
      unitCost,
      route:        params.route,
      zone:         params.zone,
      client:       params.client,
      saleDate:     saleTs,
      totalRevenue,
      totalCost,
      profit,
    });

    // Deduct inventory
    batch.update(itemRef, {
      currentStock: Math.max(0, currentStock - params.quantity),
      updatedAt: now,
    });

    // Log movement
    const movRef = doc(movCol(uid));
    batch.set(movRef, {
      inventoryId:  params.inventoryId,
      sku,
      productName:  name,
      movementType: "sale",
      quantity:     -params.quantity,
      reference:    `Venta`,
      note:         `${name} x${params.quantity} @ $${params.unitPrice}`,
      createdAt:    now,
    });

    await batch.commit();
    return { ok: true, message: "Venta registrada. Inventario actualizado automáticamente." };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, message: msg };
  }
}

// ─── Multi-item sale order ────────────────────────────────────────────────────

export async function registerSaleOrder(
  uid: string,
  params: {
    items: Array<{ inventoryId: string; quantity: number; unitPrice: number }>;
    route: string;
    zone: string;
    client: string;
    saleDate: Date;
    paymentStatus: PaymentStatus;
    dueDate?: Date;
  }
): Promise<{ ok: boolean; message: string; saleOrderId?: string; invoiceNumber?: string }> {
  try {
    // Validate all items first
    const snapshots = await Promise.all(
      params.items.map((it) => getDoc(invItemDoc(uid, it.inventoryId)))
    );
    for (let i = 0; i < params.items.length; i++) {
      const snap = snapshots[i];
      if (!snap.exists()) return { ok: false, message: "Producto no encontrado en inventario" };
      const { currentStock, name } = snap.data();
      if (currentStock < params.items[i].quantity)
        return { ok: false, message: `Stock insuficiente para "${name}": disponible ${currentStock}` };
    }

    const now        = Timestamp.now();
    const saleTs     = Timestamp.fromDate(params.saleDate);
    const dueDateTs  = params.dueDate ? Timestamp.fromDate(params.dueDate) : undefined;
    const saleOrderId = doc(salesCol(uid)).id; // shared ID for all items in this order
    const batch = writeBatch(db);

    for (let i = 0; i < params.items.length; i++) {
      const { inventoryId, quantity, unitPrice } = params.items[i];
      const snap = snapshots[i];
      const { sku, name, category, unitCost, currentStock } = snap.data()!;
      const totalRevenue = quantity * unitPrice;
      const totalCost    = quantity * unitCost;
      const profit       = totalRevenue - totalCost;

      // Sale record
      const saleRef = doc(salesCol(uid));
      batch.set(saleRef, {
        saleOrderId,
        inventoryId, sku,
        productName: name,
        category,
        quantity, unitPrice, unitCost,
        route: params.route, zone: params.zone, client: params.client,
        paymentStatus: params.paymentStatus,
        ...(dueDateTs ? { dueDate: dueDateTs } : {}),
        saleDate: saleTs,
        totalRevenue, totalCost, profit,
      });

      // Deduct inventory
      batch.update(invItemDoc(uid, inventoryId), {
        currentStock: Math.max(0, currentStock - quantity),
        updatedAt: now,
      });

      // Movement log
      batch.set(doc(movCol(uid)), {
        inventoryId, sku,
        productName: name,
        movementType: "sale",
        quantity: -quantity,
        reference: `Venta ${saleOrderId.slice(-6)}`,
        note: `${name} x${quantity} @ ${fmtCurrency(unitPrice)}`,
        createdAt: now,
      });
    }

    await batch.commit();
    const total = params.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    // Build invoice number: FAC-YYMMDD-XXXX
    const d   = params.saleDate;
    const yy  = String(d.getFullYear()).slice(2);
    const mm  = String(d.getMonth() + 1).padStart(2, "0");
    const dd  = String(d.getDate()).padStart(2, "0");
    const inv = saleOrderId.slice(-4).toUpperCase();
    const invoiceNumber = `FAC-${yy}${mm}${dd}-${inv}`;
    return { ok: true, message: `Venta registrada · ${params.items.length} producto(s) · Total ${fmtCurrency(total)}`, saleOrderId, invoiceNumber };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return v.toLocaleString("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2 });
}

export async function getSales(uid: string, days: number): Promise<Sale[]> {
  const since = Timestamp.fromDate(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );
  const q = query(salesCol(uid), orderBy("saleDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Sale))
    .filter((s) => s.saleDate >= since);
}

export function computeSummary(sales: Sale[]): SalesSummary {
  return sales.reduce(
    (acc, s) => ({
      numSales:   acc.numSales + 1,
      totalUnits: acc.totalUnits + s.quantity,
      revenue:    acc.revenue + s.totalRevenue,
      cost:       acc.cost + s.totalCost,
      profit:     acc.profit + s.profit,
    }),
    { numSales: 0, totalUnits: 0, revenue: 0, cost: 0, profit: 0 }
  );
}

export function computeByRoute(sales: Sale[]): RouteStats[] {
  const map = new Map<string, RouteStats>();
  for (const s of sales) {
    const key = s.route?.trim() || "Sin ruta";
    const cur = map.get(key) ?? {
      route: key, numSales: 0, totalUnits: 0,
      revenue: 0, cost: 0, profit: 0, marginPct: 0,
    };
    cur.numSales++;
    cur.totalUnits += s.quantity;
    cur.revenue    += s.totalRevenue;
    cur.cost       += s.totalCost;
    cur.profit     += s.profit;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    marginPct: r.revenue > 0 ? +(r.profit / r.revenue * 100).toFixed(1) : 0,
  })).sort((a, b) => b.profit - a.profit);
}

export function computeByProduct(sales: Sale[]): ProductStats[] {
  const map = new Map<string, ProductStats>();
  for (const s of sales) {
    const key = s.sku;
    const cur = map.get(key) ?? {
      sku: s.sku, productName: s.productName, category: s.category,
      numSales: 0, totalUnits: 0, revenue: 0, cost: 0, profit: 0, marginPct: 0,
    };
    cur.numSales++;
    cur.totalUnits += s.quantity;
    cur.revenue    += s.totalRevenue;
    cur.cost       += s.totalCost;
    cur.profit     += s.profit;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((p) => ({
    ...p,
    marginPct: p.revenue > 0 ? +(p.profit / p.revenue * 100).toFixed(1) : 0,
  })).sort((a, b) => b.profit - a.profit);
}

export function computeByClient(sales: Sale[]): ClientStats[] {
  const map = new Map<string, ClientStats>();
  for (const s of sales) {
    const key = s.client?.trim() || "Sin cliente";
    const cur = map.get(key) ?? {
      client: key, numSales: 0, totalUnits: 0, revenue: 0, profit: 0, marginPct: 0,
    };
    cur.numSales++;
    cur.totalUnits += s.quantity;
    cur.revenue    += s.totalRevenue;
    cur.profit     += s.profit;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((c) => ({
    ...c,
    marginPct: c.revenue > 0 ? +(c.profit / c.revenue * 100).toFixed(1) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

export function computeDailyStats(sales: Sale[]): DailyStat[] {
  const map = new Map<string, DailyStat>();
  for (const s of sales) {
    const d = format(s.saleDate.toDate(), "yyyy-MM-dd");
    const cur = map.get(d) ?? { date: d, revenue: 0, profit: 0 };
    cur.revenue += s.totalRevenue;
    cur.profit  += s.profit;
    map.set(d, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
