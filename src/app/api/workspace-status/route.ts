import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";

// Esta ruta responde distinto según quién pregunta (mismo método+URL para
// todos) — sin esto el navegador puede quedarse con la primera respuesta
// cacheada y mostrar "pendiente" para siempre aunque el admin ya haya
// aprobado la cuenta (pasó en vivo al verificar este flujo: la doc de
// Firestore y las reglas ya decían "active", pero esta ruta seguía
// devolviendo la respuesta vieja hasta forzar esto).
export const dynamic = "force-dynamic";

/**
 * Cualquier usuario autenticado puede consultar el estado de SU PROPIO workspace —
 * esto es solo para que el cliente muestre un mensaje amigable ("cuenta pendiente
 * de aprobación", "acceso suspendido"...) en vez de errores crudos de permisos, y
 * para que sepa qué módulos tiene desactivados esa empresa puntual (`disabledModules`,
 * ver UserProfile). La protección real vive en firestore.rules (workspaceIsActive())
 * — aunque alguien se salte esta ruta, cada lectura/escritura real sigue bloqueada
 * del lado servidor (caja además chequea `disabledModules` ahí mismo).
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const ownSnap = await db.collection("users").doc(decoded.uid).get();
    if (!ownSnap.exists) return noStore({ status: "active", disabledModules: [], enabledModules: [], companyTradeName: null, companyLogoUrl: null });

    const workspaceId = (ownSnap.data()?.workspaceId as string | undefined) ?? decoded.uid;
    const wsSnap = workspaceId === decoded.uid ? ownSnap : await db.collection("users").doc(workspaceId).get();
    const status = wsSnap.exists ? (wsSnap.data()?.workspaceStatus ?? "active") : "active";
    const disabledModules = wsSnap.exists ? (wsSnap.data()?.disabledModules ?? []) : [];
    const enabledModules = wsSnap.exists ? (wsSnap.data()?.enabledModules ?? []) : [];

    // Identidad visual (nombre comercial + logo) de la empresa — vive en
    // companies/{companyId} (fiscal/legal), acá solo se exponen los 2 campos
    // de marca a TODO el workspace (empleados incluidos), sin darles acceso
    // directo al doc completo (que sí tiene RIF/dirección fiscal y sigue
    // siendo solo-admin en firestore.rules). Mismo patrón que
    // disabledModules/enabledModules: un único doc leído del lado servidor,
    // reexpuesto acá con Cache-Control: no-store.
    let companyTradeName: string | null = null;
    let companyLogoUrl: string | null = null;
    const companyId = wsSnap.data()?.companyId as string | undefined;
    if (companyId) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      if (companySnap.exists) {
        const c = companySnap.data()!;
        companyTradeName = (c.tradeName || c.name || null) as string | null;
        companyLogoUrl = (c.logoUrl ?? null) as string | null;
      }
    }

    return noStore({ status, disabledModules, enabledModules, companyTradeName, companyLogoUrl });
  } catch (e) {
    // Fallamos "abierto" acá a propósito — este endpoint es solo UX. Si algo sale
    // mal, mejor mostrar la app normal (y que firestore.rules corte de verdad si
    // corresponde) que dejar a un usuario activo mirando una pantalla de error.
    console.error("workspace-status error:", e);
    return noStore({ status: "active", disabledModules: [], enabledModules: [], companyTradeName: null, companyLogoUrl: null });
  }
}
