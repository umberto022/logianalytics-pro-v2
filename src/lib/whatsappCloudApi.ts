// Cliente de bajo nivel para la WhatsApp Cloud API oficial de Meta — SOLO
// server-side (usa el token de acceso permanente, nunca NEXT_PUBLIC_*).
// No usa WhatsApp Web ni sesiones por QR. Un HTTP 200 acá SOLO significa que
// Meta aceptó/encoló el mensaje — nunca que llegó al teléfono; el estado real
// (delivered/read/failed) llega por webhook (ver src/app/api/webhooks/whatsapp).
//
// Referencia (verificada en developers.facebook.com, sep-2026):
// - Endpoint: POST https://graph.facebook.com/{version}/{phone-number-id}/messages
// - Versión estable recomendada actual: v23.0 (v26.0 es la más nueva; se deja
//   configurable por env var para no tener que tocar código si Meta retira una versión).
// - Fuera de la ventana de servicio de 24h, SOLO se puede enviar un mensaje de
//   plantilla (template) previamente aprobado — nunca texto libre.

const DEFAULT_API_VERSION = "v23.0";

function graphApiVersion(): string {
  return process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;
}

export interface WhatsappSendResult {
  ok: boolean;
  /** wamid devuelto por Meta — solo presente si ok:true. */
  messageId?: string;
  /**
   * Resumen SEGURO del error (código + mensaje de Meta), nunca el payload
   * crudo ni el token — apto para guardar en Firestore y mostrar en la UI.
   */
  errorSafe?: string;
  /**
   * true = tiene sentido reintentar más tarde (rate limit, error 5xx de Meta,
   * timeout de red). false = error permanente (plantilla inválida, número
   * receptor inválido, token vencido) — reintentar no cambiaría el resultado.
   */
  retryable: boolean;
  /** true = la llamada no completó con una respuesta clara de Meta (timeout / error de red) — no sabemos si Meta la procesó o no. Ver nota de "exactamente una vez" en whatsappNotificationJob.ts. */
  ambiguous?: boolean;
}

export interface WhatsappCloudConfig {
  accessToken: string;
  phoneNumberId: string;
}

/** Lee la config del entorno — undefined si falta alguna variable (el caller decide qué hacer, nunca se inventa un valor). */
export function getWhatsappCloudConfig(): WhatsappCloudConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

/**
 * Clasifica un código de error de la Graph API de Meta en reintentable o no.
 * Basado en los códigos documentados de la plataforma:
 * - 4/80007/130429/131048/131056: throughput/rate limit → reintentable.
 * - 131026 (mensaje no entregable), 131047 (fuera de ventana sin plantilla),
 *   132000-132999 (plantilla inválida/rechazada), 190 (token vencido/invalido),
 *   100 (parámetro inválido) → permanente, no reintentable.
 * - Cualquier código no reconocido: se trata como NO reintentable por
 *   default (mejor fallar visible y que un humano lo revise, que reintentar
 *   a ciegas un error que nunca se va a resolver solo).
 */
function isRetryableMetaErrorCode(code: number | undefined): boolean {
  if (code === undefined) return false;
  const RETRYABLE = new Set([4, 80007, 130429, 131048, 131056, 131057]);
  return RETRYABLE.has(code);
}

export async function sendWhatsappTemplateMessage(params: {
  config: WhatsappCloudConfig;
  to: string; // E.164, ej. "+18095551234"
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  /** Timeout de la petición en ms — evita que una función serverless quede colgada esperando a Meta. */
  timeoutMs?: number;
}): Promise<WhatsappSendResult> {
  const url = `https://graph.facebook.com/${graphApiVersion()}/${params.config.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      components: [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }],
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 8000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json().catch(() => null);

    if (res.ok && json?.messages?.[0]?.id) {
      return { ok: true, messageId: json.messages[0].id as string, retryable: false };
    }

    const code = json?.error?.code as number | undefined;
    const subcode = json?.error?.error_subcode as number | undefined;
    const message = (json?.error?.message as string | undefined) ?? `HTTP ${res.status}`;
    const errorSafe = `Meta ${res.status}${code !== undefined ? ` (code ${code}${subcode ? `/${subcode}` : ""})` : ""}: ${message}`.slice(0, 300);

    // 5xx de Meta siempre vale la pena reintentar, además de los códigos de rate-limit conocidos.
    const retryable = res.status >= 500 || isRetryableMetaErrorCode(code);
    return { ok: false, errorSafe, retryable };
  } catch (e: unknown) {
    clearTimeout(timeout);
    // Timeout o error de red: AMBIGUO — no sabemos si Meta llegó a procesar el
    // envío antes de que se cortara la conexión. Se marca reintentable pero
    // ambiguous:true para que quede documentado (ver whatsappNotificationJob.ts).
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      errorSafe: aborted ? "Timeout esperando respuesta de Meta" : `Error de red: ${e instanceof Error ? e.message : "desconocido"}`,
      retryable: true,
      ambiguous: true,
    };
  }
}
