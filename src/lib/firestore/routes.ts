import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, orderBy, query, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface RouteRecord {
  id: string;
  name: string;
  zone: string;
  description: string;
  active: boolean;
  createdAt: Timestamp;
}

const col = (uid: string) =>
  collection(db, "users", uid, "routes");

export async function listRoutes(uid: string): Promise<RouteRecord[]> {
  const snap = await getDocs(query(col(uid), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteRecord));
}

export async function addRoute(
  uid: string,
  data: Omit<RouteRecord, "id" | "createdAt">
): Promise<{ ok: true; id: string }> {
  const ref = await addDoc(col(uid), { ...data, createdAt: Timestamp.now() });
  return { ok: true, id: ref.id };
}

export async function updateRoute(
  uid: string,
  id: string,
  data: Partial<Omit<RouteRecord, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(col(uid), id), data);
}

export async function deleteRoute(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id));
}
