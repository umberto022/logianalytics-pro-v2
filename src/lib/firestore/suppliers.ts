import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, orderBy, query, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAudit } from "./auditLog";

export interface Supplier {
  id: string;
  name: string;
  rnc: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt: Timestamp;
}

const col = (uid: string) => collection(db, "users", uid, "suppliers");

export async function addSupplier(
  uid: string,
  data: Omit<Supplier, "id" | "createdAt">
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const ref = await addDoc(col(uid), { ...data, createdAt: Timestamp.now() });
    void logAudit(uid, "supplier_add", ref.id, data.name, data.rnc ? `RNC: ${data.rnc}` : "Sin RNC");
    return { ok: true, message: `Proveedor "${data.name}" agregado`, id: ref.id };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function updateSupplier(
  uid: string,
  id: string,
  data: Partial<Omit<Supplier, "id" | "createdAt">>
): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(doc(col(uid), id), data);
    void logAudit(uid, "supplier_update", id, id, "Datos actualizados");
    return { ok: true, message: "Proveedor actualizado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function deleteSupplier(
  uid: string,
  id: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteDoc(doc(col(uid), id));
    void logAudit(uid, "supplier_delete", id, id, "Proveedor eliminado");
    return { ok: true, message: "Proveedor eliminado" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

export async function listSuppliers(uid: string): Promise<Supplier[]> {
  try {
    const snap = await getDocs(query(col(uid), orderBy("name", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));
  } catch {
    return [];
  }
}
