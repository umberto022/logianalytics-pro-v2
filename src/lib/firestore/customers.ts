import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Customer } from "@/types";
import { logAudit } from "./auditLog";

const col = (uid: string) => collection(db, "customers", uid, "records");

export async function listCustomers(uid: string): Promise<Customer[]> {
  const q = query(col(uid), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
}

export async function addCustomer(
  uid: string,
  data: Omit<Customer, "id" | "createdAt" | "updatedAt">
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const now = Timestamp.now();
    const ref = await addDoc(col(uid), { ...data, createdAt: now, updatedAt: now });
    void logAudit(uid, "customer_add", ref.id, data.name, data.rnc ? `RNC: ${data.rnc}` : "Sin RNC");
    return { ok: true, message: `Cliente "${data.name}" agregado`, id: ref.id };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function updateCustomer(
  uid: string,
  customerId: string,
  data: Partial<Omit<Customer, "id" | "createdAt">>
): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(doc(col(uid), customerId), { ...data, updatedAt: Timestamp.now() });
    void logAudit(uid, "customer_update", customerId, data.name ?? customerId, "Datos actualizados");
    return { ok: true, message: "Cliente actualizado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function deleteCustomer(
  uid: string,
  customerId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteDoc(doc(col(uid), customerId));
    void logAudit(uid, "customer_delete", customerId, customerId, "Cliente eliminado");
    return { ok: true, message: "Cliente eliminado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}
