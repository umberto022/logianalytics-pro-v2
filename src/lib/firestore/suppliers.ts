import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, orderBy, query, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

export async function listSuppliers(uid: string): Promise<Supplier[]> {
  const snap = await getDocs(query(col(uid), orderBy("name", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));
}

export async function addSupplier(
  uid: string,
  data: Omit<Supplier, "id" | "createdAt">
): Promise<{ ok: true; id: string }> {
  const ref = await addDoc(col(uid), { ...data, createdAt: Timestamp.now() });
  return { ok: true, id: ref.id };
}

export async function updateSupplier(
  uid: string,
  id: string,
  data: Partial<Omit<Supplier, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(col(uid), id), data);
}

export async function deleteSupplier(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id));
}
