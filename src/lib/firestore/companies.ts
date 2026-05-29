import {
  collection, doc, addDoc, getDoc, updateDoc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Company } from "@/types";

const companiesCol = collection(db, "companies");

export async function createCompany(
  ownerId: string,
  data: Omit<Company, "id" | "ownerId" | "createdAt">
): Promise<{ ok: boolean; id?: string; message: string }> {
  try {
    const ref = await addDoc(companiesCol, {
      ...data,
      ownerId,
      createdAt: Timestamp.now(),
    });
    return { ok: true, id: ref.id, message: "Empresa registrada" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, message: msg };
  }
}

export async function getCompany(companyId: string): Promise<Company | null> {
  const snap = await getDoc(doc(companiesCol, companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Company;
}

export async function updateCompany(
  companyId: string,
  data: Partial<Omit<Company, "id" | "ownerId" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(companiesCol, companyId), data);
}
