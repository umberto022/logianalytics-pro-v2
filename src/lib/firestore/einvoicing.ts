import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit as fsLimit, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ElectronicInvoice, ECfType, ECfStatus } from "@/types";

const invoicesCol = (workspaceId: string) =>
  collection(db, "electronicInvoices", workspaceId, "records");

/**
 * Crea el registro local de un e-CF en estado "borrador", antes de enviarlo a
 * Alanube. Separa "armar el comprobante" (rápido, siempre funciona) de
 * "enviarlo a DGII" (depende de la API externa) — así un fallo de red no
 * pierde el trabajo de armado.
 */
export async function createDraftInvoice(
  workspaceId: string,
  data: Omit<ElectronicInvoice, "id" | "status" | "createdAt" | "updatedAt">
): Promise<string> {
  const now = Timestamp.now();
  const ref = await addDoc(invoicesCol(workspaceId), {
    ...data,
    status: "borrador" as ECfStatus,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/** Aplica el resultado (éxito o error) de la llamada a Alanube sobre el borrador. */
export async function updateInvoiceResult(
  workspaceId: string,
  invoiceId: string,
  result: Partial<Pick<ElectronicInvoice,
    "status" | "eNcf" | "trackId" | "securityCode" | "printUrl" | "errorMessage">>
): Promise<void> {
  await updateDoc(doc(invoicesCol(workspaceId), invoiceId), {
    ...result,
    updatedAt: Timestamp.now(),
  });
}

export async function getInvoice(workspaceId: string, invoiceId: string): Promise<ElectronicInvoice | null> {
  const snap = await getDoc(doc(invoicesCol(workspaceId), invoiceId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ElectronicInvoice;
}

export async function getInvoiceBySaleOrder(
  workspaceId: string, saleOrderId: string
): Promise<ElectronicInvoice | null> {
  const snap = await getDocs(
    query(invoicesCol(workspaceId), where("saleOrderId", "==", saleOrderId), fsLimit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as ElectronicInvoice;
}

export async function listInvoices(workspaceId: string, max = 200): Promise<ElectronicInvoice[]> {
  const snap = await getDocs(
    query(invoicesCol(workspaceId), orderBy("createdAt", "desc"), fsLimit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectronicInvoice));
}

export const ECF_STATUS_LABELS: Record<ECfStatus, string> = {
  borrador:  "Borrador",
  enviado:   "Enviado — esperando DGII",
  aceptado:  "Aceptado",
  rechazado: "Rechazado",
  anulado:   "Anulado",
  error:     "Error de envío",
};

export const ECF_STATUS_COLOR: Record<ECfStatus, string> = {
  borrador:  "text-slate-600 bg-slate-50 border-slate-200",
  enviado:   "text-blue-700 bg-blue-50 border-blue-200",
  aceptado:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  rechazado: "text-red-700 bg-red-50 border-red-200",
  anulado:   "text-slate-500 bg-slate-100 border-slate-200",
  error:     "text-red-700 bg-red-50 border-red-200",
};

export function defaultECfType(buyerRnc?: string): ECfType {
  // Sin RNC del comprador → consumidor final (32). Con RNC → crédito fiscal (31),
  // porque habilita al comprador a usarlo como gasto/crédito ante DGII.
  return buyerRnc ? "31" : "32";
}
