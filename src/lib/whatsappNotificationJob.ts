// Orquestación del aviso automático por WhatsApp — server-only (Admin SDK).
//
// Un job vive en `whatsappNotifications/{workspaceId}/jobs/{quoteId}` (mismo id
// que la cotización → a lo sumo UNO por solicitud). Se crea en la MISMA
// transacción que la cotización (ver persistCatalogQuote), así que nunca queda
// una solicitud sin su job ni un job huérfano.
//
// Máquina de estados (ver WhatsappNotificationStatus en src/types):
//
//   pending ──claim──▶ sending ──Meta 200──▶ accepted ──webhook──▶ sent ▶ delivered ▶ read
//      ▲                  │
//      │ (backoff)        ├─ error definitivo reintentable ─▶ pending (nextAttemptAt = ahora + backoff)
//      └──────────────────┤─ error permanente / sin intentos ─▶ failed
//                         └─ timeout/corte AMBIGUO ──────────▶ unconfirmed (NO se reenvía solo)
//
// Garantías y límites (dichos sin adornos):
//  - TOMA ATÓMICA: pasar de "pending" a "sending" ocurre en una transacción de
//    Firestore con un lease (vence en LEASE_MS). Dos workers concurrentes (envío
//    en línea + cola + reintento manual) no pueden llamar a Meta por el mismo
//    intento. Solo el dueño del lease puede cerrar ese intento.
//  - LEASE VENCIDO = AMBIGUO: si un worker murió después de tomar el job, no
//    sabemos si llegó a llamar a Meta → pasa a "unconfirmed", no se reenvía.
//  - TIMEOUT AMBIGUO: WhatsApp Cloud API no ofrece clave de idempotencia ni una
//    consulta de mensajes enviados. Cada envío lleva `biz_opaque_callback_data`
//    (workspace|solicitud|intento); si el mensaje sí salió, el webhook de estado
//    lo trae de vuelta y el job se reconcilia solo. Si no aparece evidencia, un
//    humano decide (botón "Reintentar aviso", que puede duplicar el aviso).
//  - NO se promete "exactamente una vez": la promesa es "como máximo un intento
//    concurrente y ningún reenvío automático tras una incertidumbre".
//  - CONFIGURACIÓN AUSENTE no consume intentos ni cambia el estado.
//  - AVISOS VIEJOS no se envían: pasado WHATSAPP_JOB_MAX_AGE_MINUTES (o creados
//    antes de WHATSAPP_SEND_NOT_BEFORE) pasan a "expired". Activar credenciales
//    nunca provoca una ráfaga de avisos atrasados.
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash, randomUUID } from "crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  getWhatsappCloudConfig, isWhatsappSendingEnabled, sendWhatsappTemplateMessage,
  type WhatsappSendResult,
} from "@/lib/whatsappCloudApi";
import { scheduleWorkerWake } from "@/lib/jobQueue";
import type { CatalogQuote, CatalogQuoteItem, WhatsappNotificationStatus } from "@/types";

export const MAX_ATTEMPTS = 5;
/** Cuánto vale un lease de "sending" — mayor que el timeout de la llamada a Meta y que el máximo de una función serverless. */
export const LEASE_MS = 2 * 60_000;
/** Cuánto esperar un webhook que reconcilie un envío ambiguo antes de dejarlo para revisión humana. */
export const RECONCILE_WINDOW_MS = 30 * 60_000;
export const DEFAULT_MAX_AGE_MINUTES = 360;

/** Transacción con más reintentos que el default (5): varios workers/webhooks pueden competir por el mismo job. */
export function runTx<T>(db: Firestore, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.runTransaction(fn, { maxAttempts: 10 });
}

const jobRef = (db: Firestore, workspaceId: string, quoteId: string) =>
  db.collection("whatsappNotifications").doc(workspaceId).collection("jobs").doc(quoteId);

/** Minutos de espera antes del siguiente intento — exponencial (2, 4, 8, 16…), tope 60 min. */
export function backoffMinutes(attemptNumber: number): number {
  return Math.min(2 ** attemptNumber, 60);
}

// ─── Receptor y plantilla ────────────────────────────────────────────────────

/** Normaliza el número receptor de la configuración protegida a E.164, o null si no es un número válido. */
export function normalizeRecipient(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned.startsWith("+") ? cleaned : `+${cleaned}`);
  return parsed && parsed.isValid() ? parsed.number : null;
}

export function internationalPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** Resumen de unidades del pedido, ej. "12 unidades en 3 productos". */
export function orderSummary(items: CatalogQuoteItem[]): string {
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const lines = items.length;
  return `${totalQty} unidad${totalQty === 1 ? "" : "es"} en ${lines} producto${lines === 1 ? "" : "s"}`;
}

/**
 * Variables del cuerpo de la plantilla, en el orden de {{1}}..{{5}} (ver
 * WHATSAPP_SETUP.md). El enlace autenticado NO va en el cuerpo: es el botón de
 * URL de la plantilla, cuyo sufijo dinámico es el id de la solicitud.
 */
export function buildTemplateBodyParams(params: {
  businessName: string;
  customerName: string;
  customerPhone: string; // E.164 guardado en la solicitud
  publicRef: string;
  items: CatalogQuoteItem[];
}): string[] {
  return [
    params.businessName,
    params.customerName,
    internationalPhone(params.customerPhone),
    params.publicRef,
    orderSummary(params.items),
  ];
}

// ─── Correlación con webhooks ────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Dato opaco que Meta devuelve en los webhooks de estado de este mensaje. */
export function buildCallbackData(workspaceId: string, quoteId: string, attempt: number): string {
  return `wa1|${workspaceId}|${quoteId}|${attempt}`;
}

export function parseCallbackData(raw: unknown): { workspaceId: string; quoteId: string; attempt: number } | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts.length !== 4 || parts[0] !== "wa1") return null;
  const [, workspaceId, quoteId, attemptStr] = parts;
  const attempt = Number(attemptStr);
  if (!ID_RE.test(workspaceId) || !ID_RE.test(quoteId) || !Number.isInteger(attempt) || attempt < 1) return null;
  return { workspaceId, quoteId, attempt };
}

// ─── Frescura (protección contra envíos masivos de avisos viejos) ─────────────

export function evaluateFreshness(
  freshSinceMs: number,
  nowMs: number,
  env: Record<string, string | undefined> = process.env
): "fresh" | "too_old" | "before_activation" {
  const notBeforeRaw = env.WHATSAPP_SEND_NOT_BEFORE;
  if (notBeforeRaw) {
    const notBefore = Date.parse(notBeforeRaw);
    if (!Number.isNaN(notBefore) && freshSinceMs < notBefore) return "before_activation";
  }
  const parsed = Number(env.WHATSAPP_JOB_MAX_AGE_MINUTES);
  const maxAgeMin = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_MINUTES;
  return nowMs - freshSinceMs > maxAgeMin * 60_000 ? "too_old" : "fresh";
}

// ─── Creación del job (dentro de la transacción de la solicitud) ─────────────

/**
 * Crea el job "pending" DENTRO de la transacción que crea la cotización. Si el
 * receptor de la configuración protegida no es un número válido, el job nace
 * "failed" con un motivo claro (la solicitud igual se guarda) — nunca se
 * deduce un teléfono de otro lado ni se usa el que mandó el visitante.
 */
export function stageNotificationJob(
  db: Firestore,
  tx: Transaction,
  workspaceId: string,
  quoteId: string,
  configuredRecipient: string
) {
  const now = Timestamp.now();
  const recipient = normalizeRecipient(configuredRecipient);
  tx.set(jobRef(db, workspaceId, quoteId), {
    quoteId,
    status: (recipient ? "pending" : "failed") as WhatsappNotificationStatus,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    freshSince: now,
    recipientPhone: recipient ?? configuredRecipient,
    ...(recipient ? {} : { lastErrorSafe: "El WhatsApp del negocio en Mi catálogo no es un número válido (incluí el código de país)" }),
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Toma atómica ────────────────────────────────────────────────────────────

export type ClaimResult =
  | { kind: "claimed"; owner: string; attempt: number; recipientPhone: string }
  | { kind: "skip"; reason: string; status?: WhatsappNotificationStatus };

/**
 * Transacción de toma: pending → sending con lease, consumiendo UN intento.
 * `canSend=false` (config ausente/apagada) NO consume intentos ni cambia el
 * estado; solo aplica el vencimiento por antigüedad y deja constancia del motivo.
 */
export async function claimJob(
  db: Firestore,
  ref: DocumentReference,
  opts: { canSend: boolean; notConfiguredMessage?: string; now?: Timestamp }
): Promise<ClaimResult> {
  const now = opts.now ?? Timestamp.now();
  return runTx(db, async (tx): Promise<ClaimResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: "skip", reason: "job_not_found" };
    const job = snap.data()!;
    const status = job.status as WhatsappNotificationStatus;

    if (status === "sending") {
      const leaseUntil = job.nextAttemptAt as Timestamp | undefined;
      if (leaseUntil && leaseUntil.toMillis() > now.toMillis()) return { kind: "skip", reason: "in_progress", status };
      // El worker que tenía el lease no cerró el intento: pudo haber llamado a Meta o no → ambiguo, sin reenvío.
      tx.update(ref, {
        status: "unconfirmed" as WhatsappNotificationStatus,
        reconcileUntil: Timestamp.fromMillis(now.toMillis() + RECONCILE_WINDOW_MS),
        lastErrorSafe: "[intento sin cerrar] un worker murió o expiró durante el envío — no se sabe si Meta lo procesó",
        leaseOwner: FieldValue.delete(),
        updatedAt: now,
      });
      return { kind: "skip", reason: "lease_expired_unconfirmed", status: "unconfirmed" };
    }
    if (status !== "pending") return { kind: "skip", reason: "not_pending", status };

    const nextAttemptAt = job.nextAttemptAt as Timestamp | undefined;
    if (nextAttemptAt && nextAttemptAt.toMillis() > now.toMillis()) return { kind: "skip", reason: "not_due", status };

    const freshSince = (job.freshSince ?? job.createdAt) as Timestamp | undefined;
    const freshness = evaluateFreshness(freshSince?.toMillis() ?? now.toMillis(), now.toMillis());
    if (freshness !== "fresh") {
      tx.update(ref, {
        status: "expired" as WhatsappNotificationStatus,
        lastErrorSafe: freshness === "too_old"
          ? "El aviso era demasiado viejo para enviarse automáticamente"
          : "El aviso es anterior a la activación del envío automático",
        updatedAt: now,
      });
      return { kind: "skip", reason: freshness, status: "expired" };
    }

    if (!opts.canSend) {
      const msg = opts.notConfiguredMessage ?? "El envío por WhatsApp no está activado";
      if (job.lastErrorSafe !== msg) tx.update(ref, { lastErrorSafe: msg, updatedAt: now });
      return { kind: "skip", reason: "not_configured", status };
    }

    const attempts = (job.attempts ?? 0) as number;
    const maxAttempts = (job.maxAttempts ?? MAX_ATTEMPTS) as number;
    if (attempts >= maxAttempts) {
      tx.update(ref, { status: "failed" as WhatsappNotificationStatus, updatedAt: now });
      return { kind: "skip", reason: "max_attempts_reached", status: "failed" };
    }

    const owner = randomUUID();
    const attempt = attempts + 1;
    tx.update(ref, {
      status: "sending" as WhatsappNotificationStatus,
      attempts: attempt,
      leaseOwner: owner,
      nextAttemptAt: Timestamp.fromMillis(now.toMillis() + LEASE_MS),
      lastAttemptAt: now,
      updatedAt: now,
    });
    return { kind: "claimed", owner, attempt, recipientPhone: job.recipientPhone as string };
  });
}

/** Cierra el intento con el resultado de Meta — SOLO si el lease sigue siendo nuestro. */
export async function finalizeAttempt(
  db: Firestore,
  ref: DocumentReference,
  claim: Extract<ClaimResult, { kind: "claimed" }>,
  result: WhatsappSendResult
): Promise<WhatsappNotificationStatus> {
  return runTx(db, async (tx): Promise<WhatsappNotificationStatus> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "failed";
    const job = snap.data()!;
    const now = Timestamp.now();
    const ours = job.status === "sending" && job.leaseOwner === claim.owner;
    const current = job.status as WhatsappNotificationStatus;

    if (result.ok) {
      // Si el webhook llegó ANTES de cerrar (ya avanzó a sent/delivered/read), solo se registra el wamid.
      tx.update(ref, {
        providerMessageId: job.providerMessageId ?? result.messageId,
        updatedAt: now,
        leaseOwner: FieldValue.delete(),
        lastErrorSafe: FieldValue.delete(),
        ...(ours ? { status: "accepted" as WhatsappNotificationStatus } : {}),
      });
      return ours ? "accepted" : current;
    }

    if (!ours) return current; // otro proceso ya movió el job — no se pisa

    if (result.ambiguous) {
      tx.update(ref, {
        status: "unconfirmed" as WhatsappNotificationStatus,
        reconcileUntil: Timestamp.fromMillis(now.toMillis() + RECONCILE_WINDOW_MS),
        lastErrorSafe: `[respuesta ambigua] ${result.errorSafe ?? "sin detalle"}`.slice(0, 300),
        leaseOwner: FieldValue.delete(),
        updatedAt: now,
      });
      return "unconfirmed";
    }

    const attempts = job.attempts as number;
    const exhausted = attempts >= ((job.maxAttempts as number | undefined) ?? MAX_ATTEMPTS);
    const permanent = !result.retryable || exhausted;
    tx.update(ref, {
      status: (permanent ? "failed" : "pending") as WhatsappNotificationStatus,
      lastErrorSafe: (result.errorSafe ?? "error desconocido").slice(0, 300),
      leaseOwner: FieldValue.delete(),
      updatedAt: now,
      nextAttemptAt: permanent ? now : Timestamp.fromMillis(now.toMillis() + backoffMinutes(attempts) * 60_000),
    });
    return permanent ? "failed" : "pending";
  });
}

// ─── Procesamiento ───────────────────────────────────────────────────────────

export interface AttemptOutcome {
  attempted: boolean;
  ok: boolean;
  status: WhatsappNotificationStatus;
  reason?: string;
}

export interface SendGate { canSend: boolean; message?: string }

export function getSendGate(): SendGate {
  if (!isWhatsappSendingEnabled()) return { canSend: false, message: "El envío automático por WhatsApp está desactivado (WHATSAPP_SENDING_ENABLED)" };
  if (!getWhatsappCloudConfig()) return { canSend: false, message: "WhatsApp Cloud API no está configurada (faltan variables de entorno en el servidor)" };
  return { canSend: true };
}

/** Datos de la solicitud guardada + nombre del negocio, para armar la plantilla. */
async function loadNotificationContext(db: Firestore, workspaceId: string, quoteId: string) {
  const [quoteSnap, settingsSnap] = await Promise.all([
    db.collection("catalogQuotes").doc(workspaceId).collection("records").doc(quoteId).get(),
    db.collection("catalogSettings").doc(workspaceId).get(),
  ]);
  if (!quoteSnap.exists) return null;
  const quote = quoteSnap.data() as CatalogQuote;
  const businessName = (settingsSnap.data()?.businessName as string | undefined) ?? "";
  return { quote, businessName };
}

/**
 * Intenta enviar UN job ahora mismo. Lo llaman el envío en línea (justo
 * después de guardar la solicitud), el worker de la cola y el reintento
 * manual. Es seguro llamarlo varias veces a la vez: la toma atómica decide
 * quién envía; los demás reciben "in_progress"/"not_pending".
 */
export async function processJob(db: Firestore, workspaceId: string, quoteId: string): Promise<AttemptOutcome> {
  const ref = jobRef(db, workspaceId, quoteId);
  const gate = getSendGate();

  const ctx = gate.canSend ? await loadNotificationContext(db, workspaceId, quoteId) : null;
  if (gate.canSend && !ctx) {
    await ref.update({ status: "failed", lastErrorSafe: "La solicitud asociada ya no existe", updatedAt: Timestamp.now() }).catch(() => {});
    return { attempted: false, ok: false, status: "failed", reason: "quote_not_found" };
  }

  const claim = await claimJob(db, ref, { canSend: gate.canSend, notConfiguredMessage: gate.message });
  if (claim.kind === "skip") {
    return { attempted: false, ok: claim.reason === "not_pending", status: claim.status ?? "pending", reason: claim.reason };
  }

  const config = getWhatsappCloudConfig()!; // gate.canSend garantiza que existe
  const result = await sendWhatsappTemplateMessage({
    config,
    to: claim.recipientPhone,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "nueva_solicitud_cotizacion",
    languageCode: process.env.WHATSAPP_TEMPLATE_LANG || "es",
    bodyParams: buildTemplateBodyParams({
      businessName: ctx!.businessName || "Tu catálogo",
      customerName: ctx!.quote.customerName,
      customerPhone: ctx!.quote.customerPhone,
      publicRef: ctx!.quote.publicRef,
      items: ctx!.quote.items,
    }),
    buttonUrlParam: quoteId,
    callbackData: buildCallbackData(workspaceId, quoteId, claim.attempt),
  });

  const status = await finalizeAttempt(db, ref, claim, result);
  // Reintento con espera progresiva: el job ya quedó "pending" con nextAttemptAt en Firestore; esto
  // solo despierta al worker a esa hora (no-op sin cola; el barrido programado lo levanta igual).
  if (status === "pending") {
    await scheduleWorkerWake({ workspaceId, quoteId, attempt: claim.attempt, delaySeconds: backoffMinutes(claim.attempt) * 60 });
  }
  return { attempted: true, ok: result.ok, status, reason: result.ok ? undefined : result.errorSafe };
}

export interface SweepSummary {
  scanned: number;
  attempted: number;
  bySkip: Record<string, number>;
  byStatus: Record<string, number>;
}

/**
 * Barrido de la cola: toma los jobs vencidos (pending con backoff cumplido, o
 * sending con lease vencido) y los procesa. Lo dispara el mecanismo de
 * scheduling (cola externa / cron); NO reprocesa avisos viejos (ver claimJob).
 */
export async function processDueJobs(
  db: Firestore,
  opts: { limit?: number; deadlineMs?: number } = {}
): Promise<SweepSummary> {
  const limit = opts.limit ?? 25;
  const deadline = Date.now() + (opts.deadlineMs ?? 40_000);
  const snap = await db.collectionGroup("jobs")
    .where("status", "in", ["pending", "sending"])
    .where("nextAttemptAt", "<=", Timestamp.now())
    .orderBy("nextAttemptAt")
    .limit(limit)
    .get();

  const summary: SweepSummary = { scanned: 0, attempted: 0, bySkip: {}, byStatus: {} };
  for (const doc of snap.docs) {
    // Solo jobs de whatsappNotifications/{ws}/jobs/{quoteId} — el nombre "jobs" podría reutilizarse en otro lado.
    const workspaceDoc = doc.ref.parent.parent;
    if (!workspaceDoc || workspaceDoc.parent.id !== "whatsappNotifications") continue;
    if (Date.now() > deadline) break;
    summary.scanned++;
    const outcome = await processJob(db, workspaceDoc.id, doc.id);
    if (outcome.attempted) summary.attempted++;
    else summary.bySkip[outcome.reason ?? "unknown"] = (summary.bySkip[outcome.reason ?? "unknown"] ?? 0) + 1;
    summary.byStatus[outcome.status] = (summary.byStatus[outcome.status] ?? 0) + 1;
  }
  return summary;
}

// ─── Reintento manual ────────────────────────────────────────────────────────

/**
 * Reintento manual (botón "Reintentar aviso"): acción humana explícita sobre un
 * job "failed", "expired" o "unconfirmed". Lo reabre a "pending" con una tanda
 * NUEVA de intentos (maxAttempts = intentos ya hechos + MAX_ATTEMPTS, así el
 * número de intento sigue siendo único por job) y reinicia la frescura (si no,
 * un job "expired" volvería a vencerse al instante). Puede duplicar un aviso si
 * el original sí salió — la UI lo dice. `refreshedRecipient`: número vigente de
 * la configuración protegida, para que corregir un número mal cargado surta efecto.
 */
export async function reopenJobForManualRetry(
  db: Firestore, workspaceId: string, quoteId: string, refreshedRecipient?: string | null
): Promise<{ reopened: boolean; previous?: WhatsappNotificationStatus }> {
  const ref = jobRef(db, workspaceId, quoteId);
  return runTx(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { reopened: false };
    const previous = snap.data()!.status as WhatsappNotificationStatus;
    if (!["failed", "expired", "unconfirmed"].includes(previous)) return { reopened: false, previous };
    const now = Timestamp.now();
    const recipient = normalizeRecipient(refreshedRecipient);
    tx.update(ref, {
      status: "pending" as WhatsappNotificationStatus,
      maxAttempts: ((snap.data()!.attempts as number | undefined) ?? 0) + MAX_ATTEMPTS,
      nextAttemptAt: now,
      freshSince: now,
      updatedAt: now,
      lastErrorSafe: FieldValue.delete(),
      reconcileUntil: FieldValue.delete(),
      leaseOwner: FieldValue.delete(),
      ...(recipient ? { recipientPhone: recipient } : {}),
    });
    return { reopened: true, previous };
  });
}

// ─── Eventos de estado de Meta (webhook) ─────────────────────────────────────

export type StatusEventKind = "sent" | "delivered" | "read" | "failed";

/** Progreso confirmado por Meta: accepted < sent < delivered < read. Todo lo demás cuenta 0. */
const PROGRESS_RANK: Record<string, number> = { accepted: 1, sent: 2, delivered: 3, read: 4 };
const rank = (s: string | undefined) => PROGRESS_RANK[s ?? ""] ?? 0;

/**
 * ¿Este evento cambia el estado del job? Idempotente y tolerante a desorden:
 *  - Un evento más viejo que el último aplicado se ignora.
 *  - Nunca se "retrocede" (sent no pisa delivered).
 *  - "delivered"/"read" pisan cualquier estado que no sea progreso (incluido
 *    un "failed" anterior o un envío "unconfirmed"): es evidencia de que sí llegó.
 *  - "failed" no pisa un delivered/read ya confirmado.
 */
export function shouldApplyWebhookStatus(
  current: { status?: string; lastStatusAt?: Timestamp },
  incoming: { status: string; timestampSeconds: number }
): boolean {
  const incomingMs = incoming.timestampSeconds * 1000;
  if (current.lastStatusAt && incomingMs < current.lastStatusAt.toMillis()) return false;
  if (incoming.status === "failed") return current.status !== "failed" && rank(current.status) < rank("delivered");
  return rank(incoming.status) > rank(current.status);
}

export interface StatusEvent {
  wamid: string;
  status: StatusEventKind;
  timestampSeconds: number;
  errorSafe?: string;
}

export type StatusEventResult = "applied" | "recorded_no_change" | "duplicate" | "not_found";

/**
 * Aplica un evento de estado en UNA transacción (dos eventos simultáneos —
 * delivered y read — no se pisan) y deja el evento registrado bajo
 * `jobs/{quoteId}/events/{id}` con id determinista → un reenvío de Meta es un no-op.
 */
export async function applyStatusEvent(db: Firestore, ref: DocumentReference, event: StatusEvent): Promise<StatusEventResult> {
  const eventId = createHash("sha256").update(`${event.wamid}|${event.status}|${event.timestampSeconds}`).digest("hex").slice(0, 40);
  const eventRef = ref.collection("events").doc(eventId);
  return runTx(db, async (tx): Promise<StatusEventResult> => {
    const [jobSnap, eventSnap] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
    if (!jobSnap.exists) return "not_found";
    if (eventSnap.exists) return "duplicate";
    const job = jobSnap.data()!;
    const now = Timestamp.now();
    const eventAt = Timestamp.fromMillis(event.timestampSeconds * 1000);

    tx.set(eventRef, { wamid: event.wamid, status: event.status, eventAt, receivedAt: now });

    if (!shouldApplyWebhookStatus({ status: job.status, lastStatusAt: job.lastStatusAt }, event)) return "recorded_no_change";
    tx.update(ref, {
      status: event.status as WhatsappNotificationStatus,
      lastStatusAt: eventAt,
      updatedAt: now,
      providerMessageId: job.providerMessageId ?? event.wamid,
      ...(event.status === "failed" && event.errorSafe ? { lastErrorSafe: event.errorSafe } : {}),
      ...(event.status !== "failed" ? { lastErrorSafe: FieldValue.delete(), reconcileUntil: FieldValue.delete() } : {}),
    });
    return "applied";
  });
}
