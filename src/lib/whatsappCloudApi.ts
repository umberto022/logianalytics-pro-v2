// Cliente de bajo nivel para la WhatsApp Cloud API oficial de Meta — SOLO
// server-side (usa el token de acceso, nunca NEXT_PUBLIC_*).
// No usa WhatsApp Web ni sesiones por QR. Un HTTP 200 acá SOLO significa que
// Meta aceptó/encoló el mensaje — nunca que llegó al teléfono; el estado real
// (sent/delivered/read/failed) llega por webhook (ver src/app/api/webhooks/whatsapp).
//
// Referencia (verificada en developers.facebook.com, sep-2026):
// - Endpoint: POST https://graph.facebook.com/{version}/{phone-number-id}/messages
// - La versión de la Graph API es configurable por env var para no tener que
//   tocar código si Meta retira una versión.
// - Fuera de la ventana de servicio de 24h, SOLO se puede enviar un mensaje de
//   plantilla (template) previamente aprobado — nunca texto libre.
// - No hay clave de idempotencia nativa en el envío: si la llamada se corta sin
//   respuesta, NO sabemos si Meta la procesó (ver `ambiguous`).

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
  /** Código de error de Meta si vino en la respuesta. */
  errorCode?: number;
  /**
   * true = tiene sentido reintentar más tarde (rate limit, error 5xx de Meta
   * con cuerpo de error claro). false = error permanente (plantilla inválida,
   * receptor inválido, token vencido) — reintentar no cambiaría el resultado.
   * Si `ambiguous` es true, `retryable` NO autoriza un reenvío automático.
   */
  retryable: boolean;
  /**
   * true = la llamada no terminó con una respuesta clara de Meta (timeout,
   * corte de red, respuesta ilegible) — no sabemos si Meta la procesó. El
   * orquestador NO reenvía a ciegas: deja el trabajo "unconfirmed" y espera
   * evidencia del webhook (ver whatsappNotificationJob.ts).
   */
  ambiguous?: boolean;
}

export interface WhatsappCloudConfig {
  accessToken: string;
  phoneNumberId: string;
}

/** Lee la config del entorno — null si falta alguna variable (el caller decide qué hacer, nunca se inventa un valor). */
export function getWhatsappCloudConfig(): WhatsappCloudConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

/**
 * Interruptor explícito del envío externo: aunque haya credenciales cargadas,
 * NO se envía nada mientras WHATSAPP_SENDING_ENABLED no sea exactamente "true".
 * Cargar credenciales y activar el envío son dos decisiones separadas.
 */
export function isWhatsappSendingEnabled(): boolean {
  return process.env.WHATSAPP_SENDING_ENABLED === "true";
}

/**
 * Clasifica un código de error de la Graph API de Meta en reintentable o no.
 * - 4/80007/130429/131048/131056/131057: throughput/rate limit/mantenimiento → reintentable.
 * - 131026 (mensaje no entregable), 131047 (fuera de ventana sin plantilla),
 *   132000-132999 (plantilla inválida/rechazada), 190 (token vencido/inválido),
 *   100 (parámetro inválido) → permanente, no reintentable.
 * - Cualquier código no reconocido: NO reintentable por default (mejor fallar
 *   visible y que un humano lo revise, que reintentar a ciegas un error que
 *   nunca se va a resolver solo).
 */
function isRetryableMetaErrorCode(code: number | undefined): boolean {
  if (code === undefined) return false;
  const RETRYABLE = new Set([4, 80007, 130429, 131048, 131056, 131057]);
  return RETRYABLE.has(code);
}

/**
 * Meta rechaza (error 132018) parámetros de plantilla con saltos de línea,
 * tabulaciones o más de 4 espacios seguidos, y no acepta un parámetro vacío.
 * Todo texto que viene de un visitante (nombre, etc.) pasa por acá.
 */
export function sanitizeTemplateParam(text: string, maxLen = 200): string {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, maxLen).trim();
  return clean || "-";
}

export async function sendWhatsappTemplateMessage(params: {
  config: WhatsappCloudConfig;
  to: string; // E.164, ej. "+18095551234"
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  /** Sufijo dinámico del botón de URL de la plantilla (ej. el id de la solicitud). Omitir si la plantilla no tiene botón dinámico. */
  buttonUrlParam?: string;
  /**
   * Dato opaco que Meta devuelve tal cual en los webhooks de estado de ESTE
   * mensaje — permite correlacionar un evento con su trabajo aunque nunca
   * hayamos recibido el wamid (timeout ambiguo).
   */
  callbackData?: string;
  /** Timeout de la petición en ms — evita que una función serverless quede colgada esperando a Meta. */
  timeoutMs?: number;
}): Promise<WhatsappSendResult> {
  const url = `https://graph.facebook.com/${graphApiVersion()}/${params.config.phoneNumberId}/messages`;
  const components: Array<Record<string, unknown>> = [
    { type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text: sanitizeTemplateParam(text) })) },
  ];
  if (params.buttonUrlParam !== undefined) {
    components.push({
      type: "button", sub_type: "url", index: "0",
      parameters: [{ type: "text", text: params.buttonUrlParam }],
    });
  }
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    // E.164 CON "+": la doc oficial indica que sin él Meta antepone el código de país del número emisor.
    to: params.to.startsWith("+") ? params.to : `+${params.to}`,
    type: "template",
    template: { name: params.templateName, language: { code: params.languageCode }, components },
    ...(params.callbackData ? { biz_opaque_callback_data: params.callbackData } : {}),
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

    const hasMetaError = !!json?.error;
    const code = json?.error?.code as number | undefined;
    const subcode = json?.error?.error_subcode as number | undefined;
    const message = (json?.error?.message as string | undefined) ?? `HTTP ${res.status}`;
    const errorSafe = `Meta ${res.status}${code !== undefined ? ` (code ${code}${subcode ? `/${subcode}` : ""})` : ""}: ${message}`.slice(0, 300);

    // Sin cuerpo de error de Meta reconocible (HTML de un gateway, 200 sin id,
    // 5xx mudo) NO sabemos si el mensaje quedó encolado → ambiguo.
    if (!hasMetaError && (res.ok || res.status >= 500)) {
      return { ok: false, errorSafe, retryable: true, ambiguous: true };
    }

    // Un error de Meta con cuerpo claro es una respuesta DEFINITIVA de que no
    // se creó el mensaje: 5xx y códigos de rate-limit se pueden reintentar.
    const retryable = res.status >= 500 || isRetryableMetaErrorCode(code);
    return { ok: false, errorSafe, ...(code !== undefined ? { errorCode: code } : {}), retryable };
  } catch (e: unknown) {
    clearTimeout(timeout);
    // Timeout o error de red: AMBIGUO — no sabemos si Meta llegó a procesar el
    // envío antes de que se cortara la conexión.
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      errorSafe: aborted ? "Timeout esperando respuesta de Meta" : "Error de red hablando con Meta",
      retryable: true,
      ambiguous: true,
    };
  }
}
