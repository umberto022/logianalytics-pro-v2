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
  try {
    const snap = await getDocs(query(col(uid), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteRecord));
  } catch {
    return [];
  }
}

export async function addRoute(
  uid: string,
  data: Omit<RouteRecord, "id" | "createdAt">
): Promise<{ ok: boolean; id?: string; message?: string }> {
  try {
    const ref = await addDoc(col(uid), { ...data, createdAt: Timestamp.now() });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al guardar ruta" };
  }
}

export async function updateRoute(
  uid: string,
  id: string,
  data: Partial<Omit<RouteRecord, "id" | "createdAt">>
): Promise<{ ok: boolean; message?: string }> {
  try {
    await updateDoc(doc(col(uid), id), data);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al actualizar ruta" };
  }
}

export async function deleteRoute(uid: string, id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await deleteDoc(doc(col(uid), id));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al eliminar ruta" };
  }
}
