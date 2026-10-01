import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";
import { reopenJobForManualRetry, processJob } from "@/lib/whatsappNotificationJob";

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

    // El receptor vigente sale de la configuración protegida de la empresa,
    // así corregir un número mal cargado surte efecto al reintentar.
    const settingsSnap = await db.collection("catalogSettings").doc(workspaceId).get();
    const currentRecipient = settingsSnap.data()?.whatsappNumber as string | undefined;

    const { reopened, previous } = await reopenJobForManualRetry(db, workspaceId, quoteId, currentRecipient);
    if (!reopened) {
      return noStore({ error: "El aviso no está en un estado reintentable (fallido, vencido o sin confirmar) — nada para reintentar", status: previous ?? null }, { status: 400 });
    }

    const outcome = await processJob(db, workspaceId, quoteId);

    return noStore({ ok: true, status: outcome.status });
  } catch (e) {
    console.error("POST /api/catalogo/notifications/retry error:", e);
    return noStore({ error: "No se pudo reintentar el aviso" }, { status: 500 });
  }
}
