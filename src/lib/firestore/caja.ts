import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, orderBy, limit as fsLimit, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface CajaSession {
  id: string;
  date: string;          // yyyy-MM-dd
  openedAt: Timestamp;
  closedAt?: Timestamp;
  initialCash: number;
  status: "open" | "closed";
  // cierre data:
  totalSales?: number;
  totalItems?: number;
  cashSales?: number;
  cardSales?: number;
  transferSales?: number;
  creditSales?: number;
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  closingNotes?: string;
}

export interface CierreData {
  totalSales: number;
  totalItems: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  creditSales: number;
  actualCash: number;
  closingNotes?: string;
}

const cajaCol = (uid: string) => collection(db, "caja", uid, "sessions");

export async function getOpenSession(uid: string): Promise<CajaSession | null> {
  const today = new Date().toISOString().slice(0, 10);
  const snap  = await getDocs(
    query(cajaCol(uid), where("status", "==", "open"), where("date", "==", today), fsLimit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CajaSession;
}

export async function openCajaSession(uid: string, initialCash: number): Promise<CajaSession> {
  const today = new Date().toISOString().slice(0, 10);
  const now   = Timestamp.now();
  const ref   = await addDoc(cajaCol(uid), {
    date: today, openedAt: now, initialCash, status: "open",
  });
  return { id: ref.id, date: today, openedAt: now, initialCash, status: "open" };
}

export async function closeCajaSession(
  uid: string, sessionId: string, data: CierreData
): Promise<void> {
  const expectedCash = data.cashSales;
  const difference   = data.actualCash - expectedCash;
  await updateDoc(doc(db, "caja", uid, "sessions", sessionId), {
    ...data, expectedCash, difference, closedAt: Timestamp.now(), status: "closed",
  });
}

export async function getRecentSessions(uid: string): Promise<CajaSession[]> {
  const snap = await getDocs(
    query(cajaCol(uid), orderBy("openedAt", "desc"), fsLimit(10))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CajaSession));
}
