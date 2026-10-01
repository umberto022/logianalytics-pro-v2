import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { processDueJobs, processJob } from "@/lib/whatsappNotificationJob";
import { authorizeWorkerRequest } from "@/lib/workerAuth";

export const dynamic = "force-dynamic";

/**
 * Worker de avisos de WhatsApp. Dos modos:
 *  - Con cuerpo {workspaceId, quoteId} (despertador de la cola): procesa ESE job.
 *  - Sin cuerpo (barrido programado / disparo manual): procesa los jobs vencidos.
 *
 * Autorización (falla cerrado, ver src/lib/workerAuth.ts): Bearer CRON_SECRET
 * o firma de QStash. Sin ninguna de las dos configuradas, todo es 401.
 *
 * Quién lo llama, y cada cuánto:
 *  - Vercel Cron (vercel.json) — plan Hobby: UNA vez al día (best effort). Es el
 *    último respaldo, NO la recuperación en minutos.
 *  - QStash (si está configurado): un mensaje con retraso por cada reintento
 *    pendiente, y opcionalmente un schedule de barrido cada pocos minutos.
 * El envío en línea al recibir la solicitud no depende de esta ruta.
 *
 * Nunca reprocesa avisos viejos ni consume intentos si el envío está apagado o
 * sin credenciales (ver claimJob).
 */
async function handle(req: NextRequest) {
  const rawBody = req.method === "POST" ? await req.text() : "";
  const base = process.env.APP_BASE_URL || "https://logianalytics-pro-v2.vercel.app";
  const auth = authorizeWorkerRequest({
    authorizationHeader: req.headers.get("authorization"),
    signatureHeader: req.headers.get("upstash-signature"),
    rawBody,
    url: `${base}${req.nextUrl.pathname}`,
  });
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getAdminDb();

    let target: { workspaceId: string; quoteId: string } | null = null;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (typeof parsed?.workspaceId === "string" && typeof parsed?.quoteId === "string"
          && /^[A-Za-z0-9_-]{1,128}$/.test(parsed.workspaceId) && /^[A-Za-z0-9_-]{1,128}$/.test(parsed.quoteId)) {
          target = { workspaceId: parsed.workspaceId, quoteId: parsed.quoteId };
        }
      } catch { /* cuerpo no JSON: se trata como barrido */ }
    }

    if (target) {
      const outcome = await processJob(db, target.workspaceId, target.quoteId);
      return NextResponse.json({ mode: "job", via: auth.via, status: outcome.status, attempted: outcome.attempted, reason: outcome.reason });
    }
    const summary = await processDueJobs(db);
    return NextResponse.json({ mode: "sweep", via: auth.via, ...summary });
  } catch (e) {
    console.error("Worker de WhatsApp: error:", e instanceof Error ? e.message : "desconocido");
    // 500: la cola (o el próximo barrido) reintenta; el estado en Firestore es idempotente.
    return NextResponse.json({ error: "Error procesando avisos" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
