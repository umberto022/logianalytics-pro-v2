// Orquestación del aviso automático por WhatsApp — server-only (Admin SDK).
// Un job vive en `whatsappNotifications/{workspaceId}/jobs/{quoteId}` (mismo
// id que la cotización, así que solo puede existir UNO por solicitud — ver
// createQuoteWithNotificationJob en el route de solicitud, que crea la
// cotización y el job en el MISMO batch atómico).
//
// Límite documentado del proveedor (WhatsApp Cloud API): no ofrece una clave
// de idempotencia nativa para el envío. Si una llamada a Meta da timeout, NO
// sabemos con certeza si el mensaje ya salió o no ("ambiguous", ver
// whatsappCloudApi.ts) — en ese caso igual se reintenta (con backoff), lo que
// en el peor caso puede duplicar el AVISO a Stefany (no al cliente, no
// genera ninguna operación comercial). No se promete entrega "exactamente
// una vez" — solo "al menos una vez, con como máximo unos pocos duplicados
// de baja probabilidad en el peor caso".
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getWhatsappCloudConfig, sendWhatsappTemplateMessage } from "@/lib/whatsappCloudApi";
import type { CatalogQuoteItem, WhatsappNotificationStatus } from "@/types";

export const MAX_ATTEMPTS = 5;

const jobRef = (db: Firestore, workspaceId: string, quoteId: string) =>
  db.collection("whatsappNotifications").doc(workspaceId).collection("jobs").doc(quoteId);

/** Minutos de espera antes del siguiente intento — exponencial, tope 60 min. */
function backoffMinutes(attemptNumber: number): number {
  return Math.min(2 ** attemptNumber, 60);
}

function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://logianalytics-pro-v2.vercel.app";
}

/** Enlace autenticado (requiere sesión propia de la empresa — no lleva ningún token en la URL) a la solicitud dentro de la app. */
export function buildQuoteDeepLink(quoteId: string): string {
  return `${appBaseUrl()}/solicitudes?ref=${quoteId}`;
}

function orderSummary(items: CatalogQuoteItem[]): string {
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  return `${totalQty} unidad${totalQty === 1 ? "" : "es"}`;
}

/** En el mismo orden que las variables {{1}}..{{5}} del template aprobado (ver runbook de Meta). */
export function buildTemplateBodyParams(params: {
  customerName: string;
  customerPhonePretty: string;
  publicRef: string;
  items: CatalogQuoteItem[];
  quoteId: string;
}): string[] {
  return [
    params.customerName,
    params.customerPhonePretty,
    params.publicRef,
    orderSummary(params.items),
    buildQuoteDeepLink(params.quoteId),
  ];
}

/**
 * Crea el job en estado "pending" — se llama SIEMPRE dentro del mismo batch
 * que crea la CatalogQuote (atomicidad: si el batch falla, no queda ni
 * cotización ni job huérfano). No intenta enviar nada todavía.
 */
export function stageNotificationJob(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  workspaceId: string,
  quoteId: string,
  recipientPhone: string
) {
  const now = Timestamp.now();
  batch.set(jobRef(db, workspaceId, quoteId), {
    quoteId,
    status: "pending" as WhatsappNotificationStatus,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    recipientPhone,
    createdAt: now,
    updatedAt: now,
  });
}

export interface AttemptOutcome {
  attempted: boolean;
  ok: boolean;
  status: WhatsappNotificationStatus;
  reason?: string;
}

/**
 * Intenta enviar UN job ahora mismo (llamado tanto inline, justo después de
 * crear la solicitud, como por el cron de reintentos y por "Reintentar
 * aviso" en la UI). Idempotente respecto al ESTADO: si el job ya no está en
 * un estado atendible (ya fue enviado/entregado, o no existe), no hace nada.
 */
export async function attemptSendJob(
  db: Firestore,
  workspaceId: string,
  quoteId: string,
  templateParams: string[]
): Promise<AttemptOutcome> {
  const ref = jobRef(db, workspaceId, quoteId);
  const snap = await ref.get();
  if (!snap.exists) return { attempted: false, ok: false, status: "failed", reason: "job_not_found" };

  const job = snap.data()!;
  if (!["pending"].includes(job.status)) {
    return { attempted: false, ok: true, status: job.status, reason: "not_pending" };
  }
  if ((job.attempts ?? 0) >= (job.maxAttempts ?? MAX_ATTEMPTS)) {
    await ref.update({ status: "failed", updatedAt: Timestamp.now() });
    return { attempted: false, ok: false, status: "failed", reason: "max_attempts_reached" };
  }

  const config = getWhatsappCloudConfig();
  const now = Timestamp.now();
  if (!config) {
    // No configurado todavía (faltan credenciales de Meta en Vercel) — no es
    // un error del envío, es que la integración no está lista. Se deja
    // "pending" para que un reintento posterior (una vez configurado) sí
    // salga, sin perder la solicitud ni fallar la respuesta al cliente.
    await ref.update({
      updatedAt: now,
      lastErrorSafe: "WhatsApp Cloud API no está configurada (faltan variables de entorno en el servidor)",
    });
    return { attempted: false, ok: false, status: "pending", reason: "not_configured" };
  }

  const result = await sendWhatsappTemplateMessage({
    config,
    to: job.recipientPhone,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "nueva_solicitud_catalogo",
    languageCode: process.env.WHATSAPP_TEMPLATE_LANG || "es",
    bodyParams: templateParams,
  });

  const attempts = (job.attempts ?? 0) + 1;

  if (result.ok) {
    await ref.update({
      status: "sent" as WhatsappNotificationStatus,
      attempts,
      lastAttemptAt: now,
      updatedAt: now,
      providerMessageId: result.messageId,
      lastErrorSafe: FieldValue.delete(),
    });
    return { attempted: true, ok: true, status: "sent" };
  }

  const exhausted = attempts >= (job.maxAttempts ?? MAX_ATTEMPTS);
  const permanentFailure = !result.retryable || exhausted;

  await ref.update({
    status: (permanentFailure ? "failed" : "pending") as WhatsappNotificationStatus,
    attempts,
    lastAttemptAt: now,
    updatedAt: now,
    lastErrorSafe: result.ambiguous ? `[timeout ambiguo] ${result.errorSafe}` : result.errorSafe,
    ...(permanentFailure ? {} : { nextAttemptAt: Timestamp.fromMillis(now.toMillis() + backoffMinutes(attempts) * 60_000) }),
  });

  return { attempted: true, ok: false, status: permanentFailure ? "failed" : "pending", reason: result.errorSafe };
}

/**
 * Reintento manual autorizado desde la UI (botón "Reintentar aviso"): solo
 * tiene efecto sobre un job en "failed" — lo reabre a "pending" con
 * nextAttemptAt ahora, y opcionalmente resetea el contador de intentos para
 * darle una tanda nueva de reintentos (una acción humana explícita, no un
 * reintento automático más).
 */
export async function reopenFailedJobForRetry(db: Firestore, workspaceId: string, quoteId: string): Promise<boolean> {
  const ref = jobRef(db, workspaceId, quoteId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.status !== "failed") return false;
  await ref.update({
    status: "pending" as WhatsappNotificationStatus,
    attempts: 0,
    nextAttemptAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastErrorSafe: FieldValue.delete(),
  });
  return true;
}

/**
 * Aplica un evento de estado de un webhook de Meta de forma idempotente y
 * tolerante a desorden: Meta puede reenviar el mismo evento (reintenta
 * webhooks fallidos hasta 36h) y puede entregar eventos fuera de orden. Solo
 * se aplica si el evento es más nuevo que el último aplicado, y nunca se
 * "retrocede" un estado más avanzado (delivered/read) a uno anterior (sent).
 */
const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export function shouldApplyWebhookStatus(
  current: { status?: string; lastStatusAt?: Timestamp },
  incoming: { status: string; timestampSeconds: number }
): boolean {
  const incomingTs = Timestamp.fromMillis(incoming.timestampSeconds * 1000);
  if (current.lastStatusAt && incomingTs.toMillis() < current.lastStatusAt.toMillis()) return false;
  const currentRank = STATUS_RANK[current.status ?? "pending"] ?? 0;
  const incomingRank = STATUS_RANK[incoming.status] ?? 0;
  // "failed" (código de error de entrega) siempre se registra, incluso si ya estaba "sent" —
  // pero nunca pisa un "delivered"/"read" ya confirmado (llegó igual, el error es tardío/espurio).
  if (incoming.status === "failed") return currentRank < STATUS_RANK.delivered;
  return incomingRank > currentRank;
}
