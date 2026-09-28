import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";
import { reopenFailedJobForRetry, attemptSendJob, buildTemplateBodyParams } from "@/lib/whatsappNotificationJob";
import type { CatalogQuote } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Reintento MANUAL autorizado del aviso de WhatsApp de una solicitud puntual
 * ("Reintentar aviso" en Solicitudes) — solo Admin/Ventas del workspace dueño
 * de esa cotización, con el módulo catálogo habilitado. El cliente nunca
 * puede escribir el job directo (firestore.rules: write:false en
 * whatsappNotifications) — esta ruta es la única puerta de reintento manual.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return noStore({ error: "No autenticado" }, { status: 401 });

  let quoteId: string;
  try {
    ({ quoteId } = await req.json());
    if (!quoteId || typeof quoteId !== "string") throw new Error("quoteId requerido");
  } catch {
    return noStore({ error: "Falta quoteId" }, { status: 400 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const ownSnap = await db.collection("users").doc(decoded.uid).get();
    if (!ownSnap.exists) return noStore({ error: "Perfil no encontrado" }, { status: 403 });
    const own = ownSnap.data()!;
    const workspaceId = (own.workspaceId as string | undefined) ?? decoded.uid;
    const wsSnap = workspaceId === decoded.uid ? ownSnap : await db.collection("users").doc(workspaceId).get();
    const ws = wsSnap.data() ?? {};

    const role = own.role as string;
    const enabledModules = (ws.enabledModules ?? []) as string[];
    if (!["admin", "ventas"].includes(role) || !enabledModules.includes("catalogo")) {
      return noStore({ error: "Sin acceso al catálogo" }, { status: 403 });
    }

    // La cotización tiene que pertenecer a ESTE workspace — nunca se reintenta
    // el job de otra empresa a partir de un quoteId adivinado.
    const quoteSnap = await db.collection("catalogQuotes").doc(workspaceId).collection("records").doc(quoteId).get();
    if (!quoteSnap.exists) return noStore({ error: "Solicitud no encontrada" }, { status: 404 });
    const quote = quoteSnap.data() as CatalogQuote;

    const reopened = await reopenFailedJobForRetry(db, workspaceId, quoteId);
    if (!reopened) return noStore({ error: "El aviso no está en estado fallido (o no existe) — nada para reintentar" }, { status: 400 });

    const outcome = await attemptSendJob(db, workspaceId, quoteId, buildTemplateBodyParams({
      customerName: quote.customerName,
      customerPhonePretty: quote.customerPhone,
      publicRef: quote.publicRef,
      items: quote.items,
      quoteId,
    }));

    return noStore({ ok: true, status: outcome.status });
  } catch (e) {
    console.error("POST /api/catalogo/notifications/retry error:", e);
    return noStore({ error: "No se pudo reintentar el aviso" }, { status: 500 });
  }
}
