import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

// Esta ruta responde distinto según quién pregunta (mismo método+URL para
// todos) — sin esto el navegador puede quedarse con la primera respuesta
// cacheada y mostrar "pendiente" para siempre aunque el admin ya haya
// aprobado la cuenta (pasó en vivo al verificar este flujo: la doc de
// Firestore y las reglas ya decían "active", pero esta ruta seguía
// devolviendo la respuesta vieja hasta forzar esto).
export const dynamic = "force-dynamic";

function noStore(body: Record<string, unknown>, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

/**
 * Cualquier usuario autenticado puede consultar el estado de SU PROPIO workspace —
 * esto es solo para que el cliente muestre un mensaje amigable ("cuenta pendiente
 * de aprobación", "acceso suspendido"...) en vez de errores crudos de permisos.
 * La protección real vive en firestore.rules (workspaceIsActive()) — aunque alguien
 * se salte esta ruta, cada lectura/escritura real sigue bloqueada del lado servidor.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const ownSnap = await db.collection("users").doc(decoded.uid).get();
    if (!ownSnap.exists) return noStore({ status: "active" });

    const workspaceId = (ownSnap.data()?.workspaceId as string | undefined) ?? decoded.uid;
    const wsSnap = workspaceId === decoded.uid ? ownSnap : await db.collection("users").doc(workspaceId).get();
    const status = wsSnap.exists ? (wsSnap.data()?.workspaceStatus ?? "active") : "active";

    return noStore({ status });
  } catch (e) {
    // Fallamos "abierto" acá a propósito — este endpoint es solo UX. Si algo sale
    // mal, mejor mostrar la app normal (y que firestore.rules corte de verdad si
    // corresponde) que dejar a un usuario activo mirando una pantalla de error.
    console.error("workspace-status error:", e);
    return noStore({ status: "active" });
  }
}
