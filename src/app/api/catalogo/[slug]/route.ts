import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { noStoreJson as noStore } from "@/lib/noStoreJson";
import { buildPublicCatalogPayload, resolvePublicCatalog } from "@/lib/catalogPublicPayload";

export const dynamic = "force-dynamic";

/**
 * Catálogo público — SIN autenticación, por diseño (el visitante no tiene
 * cuenta). Por eso lee con Admin SDK (bypassa firestore.rules) en vez de
 * exponer una regla pública en las colecciones reales: así nunca hace falta
 * decidir "qué campo es seguro leer directo" en firestore.rules, se decide
 * acá, explícitamente, en buildPublicCatalogPayload.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const db = getAdminDb();
    // Mismo 404 genérico si el slug no existe, si la empresa lo apagó, o si
    // el workspace (la cuenta) está suspendido/cancelado — no dar pistas de
    // cuál es el motivo real.
    const resolved = await resolvePublicCatalog(db, params.slug);
    if (!resolved) return noStore({ error: "Catálogo no encontrado" }, { status: 404 });

    const payload = await buildPublicCatalogPayload(db, resolved.workspaceId, resolved.settings);
    return noStore(payload);
  } catch (e) {
    console.error("GET /api/catalogo/[slug] error:", e);
    return noStore({ error: "Error al cargar el catálogo" }, { status: 500 });
  }
}
