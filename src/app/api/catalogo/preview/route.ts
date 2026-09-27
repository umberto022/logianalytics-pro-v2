import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";
import { buildPublicCatalogPayload } from "@/lib/catalogPublicPayload";

export const dynamic = "force-dynamic";

/**
 * Vista previa del catálogo AUTENTICADA — misma forma de respuesta que la
 * ruta pública (/api/catalogo/[slug]), pero ignora `enabled` (para poder
 * previsualizar antes de publicar) y exige que quien pregunta sea
 * Admin/Ventas de ESE workspace con el módulo "catalogo" habilitado. Así
 * evitamos pasar un token de sesión por la URL del catálogo público (que
 * podría quedar en el historial del navegador o en logs) — la vista previa
 * vive en una ruta interna aparte (/catalogo/vista-previa).
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return noStore({ error: "No autenticado" }, { status: 401 });

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

    const settingsSnap = await db.collection("catalogSettings").doc(workspaceId).get();
    if (!settingsSnap.exists) return noStore({ error: "Todavía no configuraste tu catálogo" }, { status: 404 });

    const payload = await buildPublicCatalogPayload(db, workspaceId, settingsSnap.data());
    return noStore({ ...payload, enabled: !!settingsSnap.data()?.enabled, publicSlug: settingsSnap.data()?.publicSlug });
  } catch (e) {
    console.error("GET /api/catalogo/preview error:", e);
    return noStore({ error: "No se pudo cargar la vista previa" }, { status: 500 });
  }
}
