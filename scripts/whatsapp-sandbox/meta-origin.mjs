// Clasificación por ORIGEN de lo que llega al túnel, para no confundir tráfico real de Meta con pruebas sintéticas.
//
// IMPORTANTE — qué es y qué NO es esto:
//  - Es una ETIQUETA de origen para lectura humana y para el vigilante. Un evento SINTÉTICO (generado por nuestros propios
//    scripts con el App Secret, p. ej. preflight o un canario) es válido criptográficamente pero NO viene de Meta y no
//    demuestra nada sobre Meta.
//  - La AUTENTICIDAD la da solo la firma X-Hub-Signature-256 (la valida el webhook). El User-Agent es falsificable: sirve para
//    etiquetar, nunca para autorizar.
//  - NINGUNA señal del webhook AUTORIZA un envío. La única autorización técnica de enviar es consultar la API de Meta
//    (GET /{waba}/message_templates) justo antes de enviar y ver APPROVED (ver e2e.mjs).

export const SYNTHETIC_HEADER = "x-sandbox-synthetic";

/** Añade a un fetch las cabeceras que marcan la petición como sintética (la usan preflight y los canarios). */
export function syntheticInit(init = {}) {
  return { ...init, headers: { ...(init.headers ?? {}), [SYNTHETIC_HEADER]: "1", "user-agent": "sandbox-synthetic/1" } };
}

const header = (headers, name) => {
  const key = Object.keys(headers ?? {}).find((h) => h.toLowerCase() === name);
  const v = key ? headers[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
};

/** "SINTETICO" | "META" | "OTRO" a partir de las cabeceras de la petición. Lo sintético gana siempre. */
export function classifyOrigin(headers) {
  if (header(headers, SYNTHETIC_HEADER) !== undefined) return "SINTETICO";
  const ua = header(headers, "user-agent") ?? "";
  if (ua.startsWith("sandbox-synthetic")) return "SINTETICO";
  // Los POST REALES de webhook de Meta llegan con User-Agent "facebookexternalua" a secas (sin versión); las verificaciones GET con
  // "facebookplatform/1.0" y el rastreo del botón con "facebookexternalhit/1.1". Valores observados en el túnel (2026-09-30).
  if (/^facebook(platform|externalua|externalhit)(\/|\s|$)/i.test(ua)) return "META";
  return "OTRO";
}

/** Convierte una entrada del inspector de ngrok (/api/requests/http) en un objeto plano y seguro de mostrar. */
export function decodeInspectorEntry(r) {
  const raw = r.request?.raw ? Buffer.from(r.request.raw, "base64").toString("utf8") : "";
  const bodyText = raw.includes("\r\n\r\n") ? raw.split("\r\n\r\n").slice(1).join("\r\n\r\n") : "";
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* no JSON */ }
  const url = new URL(r.request.uri, "http://x");
  return {
    id: r.id,
    at: r.start,
    method: r.request.method,
    path: url.pathname,
    status: r.response?.status_code,
    origin: classifyOrigin(r.request.headers),
    remote: r.remote_addr,
    signed: header(r.request.headers, "x-hub-signature-256") !== undefined,
    body,
  };
}

/** Resumen legible y sin datos personales del contenido de un webhook de WhatsApp. */
export function describeWebhookBody(body) {
  const out = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value ?? {};
      if (change?.field === "message_template_status_update") {
        out.push(`plantilla ${v.message_template_name ?? "?"} → ${v.event ?? "?"}${v.reason && v.reason !== "NONE" ? ` (${v.reason})` : ""}`);
      } else if (change?.field === "messages" && Array.isArray(v.statuses)) {
        for (const s of v.statuses) out.push(`estado de mensaje ${s.status ?? "?"}`);
      } else {
        out.push(`campo ${change?.field ?? "?"}`);
      }
    }
  }
  return out.length ? out : ["(sin cambios reconocibles)"];
}

/** ¿Debe el vigilante avisar de esta petición? SOLO POST al webhook de origen META. Lo sintético y lo desconocido jamás avisan. */
export function shouldAlertWatcher(entry, webhookPath = "/api/webhooks/whatsapp") {
  return entry.origin === "META" && entry.method === "POST" && entry.path === webhookPath;
}
