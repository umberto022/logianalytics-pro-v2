// Utilidades puras del webhook de WhatsApp Cloud API (Meta) — sin Firestore ni
// red, para poder probarlas a fondo. El route handler las orquesta.
import { createHmac, timingSafeEqual } from "crypto";
import type { StatusEventKind } from "@/lib/whatsappNotificationJob";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Token de verificación (handshake GET). Falla cerrado si no hay token configurado o vacío. */
export function verifyHandshakeToken(provided: string | null, configured: string | undefined): boolean {
  if (!configured || !provided) return false;
  return safeEqual(provided, configured);
}

/** El challenge de Meta es un entero; se acepta solo un token corto alfanumérico para no reflejar basura. */
export function isSafeChallenge(challenge: string | null): challenge is string {
  return !!challenge && /^[A-Za-z0-9_-]{1,200}$/.test(challenge);
}

/** Firma X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(App Secret, cuerpo CRUDO). Falla cerrado sin secreto. */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signatureHeader);
}

export interface ParsedStatusEvent {
  wamid: string;
  status: StatusEventKind;
  timestampSeconds: number;
  callbackData?: string;
  errorSafe?: string;
}

export interface ParsedWebhook {
  events: ParsedStatusEvent[];
  /** Cambios ignorados por venir de OTRA cuenta emisora/WABA distinta de la nuestra (o sin nuestra config). */
  foreignChanges: number;
  /** Estados que no seguimos (ej. "deleted") o entradas mal formadas. */
  skipped: number;
  /** Avisos de Meta sobre el estado de una plantilla (aprobada/rechazada/pausada): solo nombre y estado, sin datos personales. */
  templateUpdates: Array<{ name: string; event: string; reason?: string }>;
}

const TRACKED = new Set<string>(["sent", "delivered", "read", "failed"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseStatusWebhook(
  payload: any,
  ours: { phoneNumberId?: string; businessAccountId?: string }
): ParsedWebhook {
  const out: ParsedWebhook = { events: [], foreignChanges: 0, skipped: 0, templateUpdates: [] };
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return out;

  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field === "message_template_status_update") {
        // Aviso de Meta de que una plantilla fue aprobada/rechazada/pausada. No es un estado de mensaje: solo se informa.
        const v = change.value ?? {};
        const ourWaba = !ours.businessAccountId || String(entry.id) === ours.businessAccountId; // solo plantillas de NUESTRA WABA
        if (ourWaba && typeof v.message_template_name === "string" && typeof v.event === "string") {
          out.templateUpdates.push({
            name: v.message_template_name.slice(0, 100), event: v.event.slice(0, 40),
            ...(typeof v.reason === "string" && v.reason !== "NONE" ? { reason: v.reason.slice(0, 120) } : {}),
          });
        }
        continue;
      }
      if (change?.field !== "messages") continue;
      const value = change.value ?? {};

      // Cuenta emisora: sin nuestro Phone Number ID configurado no podemos afirmar que el evento sea nuestro.
      const phoneId = value.metadata?.phone_number_id;
      const sameSender = !!ours.phoneNumberId && phoneId === ours.phoneNumberId;
      const sameWaba = !ours.businessAccountId || !entry.id || String(entry.id) === ours.businessAccountId;
      if (!sameSender || !sameWaba) { out.foreignChanges++; continue; }

      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        const ts = Number(s?.timestamp);
        if (typeof s?.id !== "string" || !TRACKED.has(s?.status) || !Number.isFinite(ts)) { out.skipped++; continue; }
        const err = s.status === "failed" ? s.errors?.[0] : undefined;
        out.events.push({
          wamid: s.id,
          status: s.status,
          timestampSeconds: ts,
          ...(typeof s.biz_opaque_callback_data === "string" ? { callbackData: s.biz_opaque_callback_data } : {}),
          ...(s.status === "failed"
            ? { errorSafe: `Meta ${err?.code ?? ""}: ${err?.title ?? err?.message ?? "error de entrega"}`.slice(0, 300) }
            : {}),
        });
      }
    }
  }
  return out;
}
