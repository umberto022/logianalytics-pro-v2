import { NextResponse } from "next/server";

/**
 * Respuesta JSON con Cache-Control: no-store explícito. Usar en TODA ruta de
 * API cuya respuesta varíe por quién pregunta (token/params) — sin esto, el
 * navegador (o un caché de borde de Vercel) puede quedarse pegado a la
 * primera respuesta para esa URL exacta y servirla para siempre, sin importar
 * qué headers de Authorization o querystring lleguen después. Encontrado en
 * vivo dos veces en este proyecto (/api/workspace-status primero,
 * /api/admin/workspaces después) — no alcanza con el header solo si la ruta
 * no está marcada dinámica y el fetch del cliente no pide no-store también.
 */
export function noStoreJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}
