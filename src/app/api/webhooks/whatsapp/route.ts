import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { applyStatusEvent, parseCallbackData } from "@/lib/whatsappNotificationJob";
import {
  isSafeChallenge, parseStatusWebhook, verifyHandshakeToken, verifyMetaSignature,
  type ParsedStatusEvent,
} from "@/lib/whatsappWebhook";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Webhook de estado de WhatsApp Cloud API (Meta).
 *  GET  → handshake de verificación (hub.mode / hub.verify_token / hub.challenge).
 *  POST → estados de mensajes enviados (sent / delivered / read / failed).
 *
 * - Cada POST se autentica con X-Hub-Signature-256 sobre el cuerpo CRUDO y el
 *   App Secret. Sin App Secret configurado, todo POST es 401 (falla cerrado).
 * - Meta reintenta los webhooks fallidos (hasta 7 días según la doc de WhatsApp) y puede duplicar o desordenar eventos: cada
 *   evento se aplica en una transacción y con id determinista (idempotente).
 * - Solo se aceptan eventos de NUESTRA cuenta emisora (phone_number_id) y que
 *   correspondan a un job nuestro (por biz_opaque_callback_data o wamid).
 * - Un error de infraestructura responde 500 para que Meta reintente (es
 *   seguro: el procesamiento es idempotente). Un evento ajeno o sin job se
 *   ignora con 200: reintentarlo no cambiaría nada.
 * - No se registra ningún teléfono ni contenido de mensajes en logs.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("hub.challenge");
  if (
    searchParams.get("hub.mode") === "subscribe" &&
    verifyHandshakeToken(searchParams.get("hub.verify_token"), process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) &&
    isSafeChallenge(challenge)
  ) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Verificación fallida" }, { status: 403 });
}

async function findJobRef(db: Firestore, ev: ParsedStatusEvent) {
  const cb = parseCallbackData(ev.callbackData);
  if (cb) {
    const ref = db.collection("whatsappNotifications").doc(cb.workspaceId).collection("jobs").doc(cb.quoteId);
    if ((await ref.get()).exists) return ref;
  }
  // Sin dato de correlación (o el job no existe): se busca por el wamid guardado al aceptar el envío.
  const snap = await db.collectionGroup("jobs").where("providerMessageId", "==", ev.wamid).limit(1).get();
  const doc = snap.docs[0];
  if (doc && doc.ref.parent.parent?.parent.id === "whatsappNotifications") return doc.ref;
  return null;
}

export async function POST(req: NextRequest) {
  // Las pruebas SINTÉTICAS (eventos firmados por nuestros propios scripts, cabecera x-sandbox-synthetic) se etiquetan en el log para
  // que nunca se confundan con eventos reales de Meta. Es solo una etiqueta: no cambia cómo se procesa ni autoriza nada.
  const tag = req.headers.get("x-sandbox-synthetic") ? "[SINTÉTICO] " : "";
  // La firma se calcula sobre el body CRUDO — nunca sobre req.json() re-serializado.
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  }
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    console.error(`${tag}Webhook de WhatsApp: firma inválida o WHATSAPP_APP_SECRET no configurado`);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = parseStatusWebhook(payload, {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  });

  const counts = { applied: 0, recordedNoChange: 0, duplicate: 0, noJob: 0 };
  try {
    const db = getAdminDb();
    for (const ev of parsed.events) {
      const ref = await findJobRef(db, ev);
      if (!ref) { counts.noJob++; continue; }
      const result = await applyStatusEvent(db, ref, {
        wamid: ev.wamid, status: ev.status, timestampSeconds: ev.timestampSeconds, errorSafe: ev.errorSafe,
      });
      if (result === "applied") counts.applied++;
      else if (result === "recorded_no_change") counts.recordedNoChange++;
      else if (result === "duplicate") counts.duplicate++;
      else counts.noJob++;
    }
  } catch (e) {
    console.error(`${tag}Webhook de WhatsApp: error de infraestructura (Meta reintentará):`, e instanceof Error ? e.message : "desconocido");
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }

  for (const t of parsed.templateUpdates) console.info(`${tag}Webhook de WhatsApp: plantilla ${t.name} → ${t.event}${t.reason ? ` (${t.reason})` : ""}`);
  console.info(`${tag}Webhook de WhatsApp: ${parsed.events.length} estado(s) — ${JSON.stringify(counts)}, ajenos=${parsed.foreignChanges}, omitidos=${parsed.skipped}, plantillas=${parsed.templateUpdates.length}`);
  return NextResponse.json({ ok: true, ...counts, foreignChanges: parsed.foreignChanges, skipped: parsed.skipped, templateUpdates: parsed.templateUpdates.length });
}
