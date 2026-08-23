import { collection, addDoc, getDocs, query, orderBy, limit, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type AuditAction =
  | "inventory_add"
  | "inventory_update"
  | "inventory_delete"
  | "stock_adjust"
  | "purchase_create"
  | "purchase_update"
  | "purchase_receive"
  | "purchase_delete"
  | "sale_register"
  | "customer_add"
  | "customer_update"
  | "customer_delete"
  | "supplier_add"
  | "supplier_update"
  | "supplier_delete"
  | "raw_material_add"
  | "raw_material_update"
  | "raw_material_delete"
  | "raw_material_stock_adjust"
  | "production_register";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entityId: string;
  entityName: string;
  detail: string;
  createdAt: Timestamp;
}

const col = (uid: string) => collection(db, "auditLog", uid, "events");

export async function logAudit(
  uid: string,
  action: AuditAction,
  entityId: string,
  entityName: string,
  detail: string
): Promise<void> {
  try {
    await addDoc(col(uid), {
      action,
      entityId,
      entityName,
      detail,
      createdAt: Timestamp.now(),
    });
  } catch {
    // audit failures must never break main flows
  }
}

export async function listAuditLog(uid: string, days = 30): Promise<AuditEntry[]> {
  try {
    const since = Timestamp.fromDate(
      new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    );
    const q = query(
      col(uid),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntry));
  } catch {
    return [];
  }
}
