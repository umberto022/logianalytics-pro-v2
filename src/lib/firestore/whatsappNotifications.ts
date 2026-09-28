import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { WhatsappNotificationJob } from "@/types";

/** Solo lectura desde el cliente — toda escritura del job pasa por Admin SDK (ver firestore.rules). */
export async function getNotificationJob(workspaceId: string, quoteId: string): Promise<WhatsappNotificationJob | null> {
  const snap = await getDoc(doc(db, "whatsappNotifications", workspaceId, "jobs", quoteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WhatsappNotificationJob;
}
