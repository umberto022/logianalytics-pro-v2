import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { shouldApplyWebhookStatus } from "@/lib/whatsappNotificationJob";
import type { WhatsappNotificationStatus } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Webhook de estado de WhatsApp Cloud API (Meta). Dos responsabilidades:
 *  GET  → handshake de verificación al configurar el webhook en Meta App Dashboard.
 *  POST → actualizaciones de estado de mensajes enviados (sent/delivered/read/failed).
 *
 * Meta reintenta activamente los webhooks que fallan ("immediately, then a
 * few more times with decreasing frequency over the next 36 hours") y puede
 * entregar eventos fuera de orden — por eso CADA escritura pasa por
 * shouldApplyWebhookStatus(), que ignora duplicados/eventos viejos en vez de
 * asumir que cada POST es nuevo.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificación fallida" }, { status: 403 });
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface MetaStatusEntry {
  id: string; // wamid
  status: string; // "sent" | "delivered" | "read" | "failed"
  timestamp: string; // unix seconds, as string
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export async function POST(req: NextRequest) {
  // Firma se calcula sobre el body CRUDO — nunca sobre el resultado de
  // req.json() (que ya perdió el formato exacto de bytes recibido).
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    console.error("Webhook de WhatsApp: firma inválida o WHATSAPP_APP_SECRET no configurado");
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = ((payload as any)?.entry ?? []) as any[];
    const statuses: MetaStatusEntry[] = entries.flatMap((e) =>
      (e.changes ?? []).flatMap((c: any) => (c.value?.statuses ?? []) as MetaStatusEntry[])
    );

    for (const s of statuses) {
      if (!["sent", "delivered", "read", "failed"].includes(s.status)) continue; // ignora estados que no seguimos (ej. "deleted")

      // El webhook no dice a qué workspace pertenece — se busca el job por
      // el wamid guardado al enviar (ver attemptSendJob). Requiere el índice
      // de colección "jobs" sobre providerMessageId (firestore.indexes.json).
      const jobsSnap = await db.collectionGroup("jobs").where("providerMessageId", "==", s.id).limit(1).get();
      if (jobsSnap.empty) {
        console.warn(`Webhook de WhatsApp: no se encontró ningún job para el mensaje ${s.id} (puede ser de otra integración o ya haber sido limpiado)`);
        continue;
      }

      const jobDoc = jobsSnap.docs[0];
      const job = jobDoc.data();
      const timestampSeconds = Number(s.timestamp);

      if (!shouldApplyWebhookStatus(
        { status: job.status, lastStatusAt: job.lastStatusAt },
        { status: s.status, timestampSeconds }
      )) {
        continue; // evento viejo/duplicado/fuera de orden — se ignora, no se reescribe nada
      }

      const errorDetail = s.status === "failed" && s.errors?.[0]
        ? `Meta ${s.errors[0].code ?? ""}: ${s.errors[0].title ?? s.errors[0].message ?? "error de entrega"}`.slice(0, 300)
        : undefined;

      await jobDoc.ref.update({
        status: s.status as WhatsappNotificationStatus,
        lastStatusAt: new Date(timestampSeconds * 1000),
        updatedAt: new Date(),
        ...(errorDetail ? { lastErrorSafe: errorDetail } : {}),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook de WhatsApp: error procesando el payload:", e);
    // 200 igual — un error nuestro procesando no debe hacer que Meta reintente
    // indefinidamente el mismo payload; queda logueado para revisión manual.
    return NextResponse.json({ ok: false });
  }
}
