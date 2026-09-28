import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { attemptSendJob, buildTemplateBodyParams } from "@/lib/whatsappNotificationJob";
import type { CatalogQuote } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Reintenta jobs de aviso de WhatsApp pendientes cuyo backoff ya venció.
 * Backstop del intento en línea que ya se hace al recibir la solicitud (ver
 * /api/catalogo/[slug]/solicitud) — cubre el caso en que ese intento falló o
 * Meta todavía no estaba configurada.
 *
 * Vercel Cron invoca esta ruta por GET; se protege igual que
 * /api/send-monthly-report (Authorization: Bearer CRON_SECRET). También
 * acepta POST para poder dispararla a mano en pruebas.
 *
 * Nota de plan de Vercel: los crons con frecuencia menor a "una vez al día"
 * requieren un plan pago (Pro o superior) — ver vercel.json.
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const now = Timestamp.now();

    const pendingSnap = await db.collectionGroup("jobs")
      .where("status", "==", "pending")
      .where("nextAttemptAt", "<=", now)
      .limit(50)
      .get();

    const results: Array<{ quoteId: string; workspaceId: string; ok: boolean }> = [];

    for (const jobDoc of pendingSnap.docs) {
      const workspaceId = jobDoc.ref.parent.parent?.id;
      const quoteId = jobDoc.id;
      if (!workspaceId) continue;

      const quoteSnap = await db.collection("catalogQuotes").doc(workspaceId).collection("records").doc(quoteId).get();
      if (!quoteSnap.exists) {
        // La cotización ya no existe (no debería pasar — nunca se borra) — se marca fallido para no reintentar al vacío.
        await jobDoc.ref.update({ status: "failed", lastErrorSafe: "La solicitud asociada ya no existe", updatedAt: now });
        continue;
      }
      const quote = quoteSnap.data() as CatalogQuote;

      const outcome = await attemptSendJob(db, workspaceId, quoteId, buildTemplateBodyParams({
        customerName: quote.customerName,
        customerPhonePretty: quote.customerPhone,
        publicRef: quote.publicRef,
        items: quote.items,
        quoteId,
      }));
      results.push({ quoteId, workspaceId, ok: outcome.ok });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (e) {
    console.error("Cron de WhatsApp: error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
