// Definición ÚNICA de la plantilla de WhatsApp del aviso de nueva solicitud. La usan template.mjs (crear/consultar en
// Meta) y una prueba unitaria que la contrasta con lo que envía el código (src/lib/whatsappNotificationJob.ts).
//
// Reglas de Meta ya verificadas en su documentación: el cuerpo NO puede empezar ni terminar con una variable
// ({{n}}); las variables son secuenciales; hasta 1024 caracteres; el botón de URL admite UNA variable al final de la URL.
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const TEMPLATE_NAME = "nueva_solicitud_cotizacion";
export const TEMPLATE_LANG = "es";
export const TEMPLATE_CATEGORY = "UTILITY";

export const BODY_TEXT = [
  "Nueva solicitud de cotización para {{1}}.",
  "",
  "Cliente: {{2}}",
  "WhatsApp del cliente: {{3}}",
  "Referencia: {{4}}",
  "Resumen: {{5}}",
  "",
  "Abre la solicitud con el botón de abajo (te pedirá iniciar sesión).",
].join("\n");

export const BUTTON_TEXT = "Ver solicitud";
// URL del botón en PRODUCCIÓN. El dominio del botón queda fijo en la plantilla al crearla: la WABA de prueba usa el dominio
// del sandbox (ver template.mjs), la de producción usa este. El sufijo {{1}} es siempre el id de la solicitud.
export const BUTTON_URL = "https://logianalytics-pro-v2.vercel.app/solicitudes?ref={{1}}";

// Ejemplos que Meta exige para revisar la plantilla (datos inventados).
export const BODY_EXAMPLE = ["Stefany's Creations", "María Pérez", "+1 809 555 1234", "SC-ABC123", "4 unidades en 2 productos"];
export const BUTTON_EXAMPLE = "abc123XYZ";

/** Cuerpo del POST /{waba-id}/message_templates. `buttonUrl`: por defecto la de producción. */
export function templatePayload(buttonUrl = BUTTON_URL) {
  return {
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANG,
    category: TEMPLATE_CATEGORY,
    components: [
      { type: "BODY", text: BODY_TEXT, example: { body_text: [BODY_EXAMPLE] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: BUTTON_TEXT, url: buttonUrl, example: [BUTTON_EXAMPLE] }] },
    ],
  };
}

/** Cómo se verá el mensaje con valores concretos (para revisar el texto exacto antes de enviar nada). */
export function renderMessage(values, buttonSuffix, buttonUrl = BUTTON_URL) {
  const body = BODY_TEXT.replace(/\{\{(\d)\}\}/g, (_, n) => values[Number(n) - 1] ?? `{{${n}}}`);
  return `${body}\n\n[Botón: ${BUTTON_TEXT} → ${buttonUrl.replace("{{1}}", buttonSuffix)}]`;
}

/**
 * Variables del cuerpo a partir de una solicitud guardada. DEBE coincidir con buildTemplateBodyParams
 * (src/lib/whatsappNotificationJob.ts): una prueba unitaria lo comprueba con varios casos.
 */
export function templateValuesFromQuote({ businessName, customerName, customerPhone, publicRef, items }) {
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
  const intl = parsePhoneNumberFromString(customerPhone)?.formatInternational() ?? customerPhone;
  return [
    businessName,
    customerName,
    intl,
    publicRef,
    `${totalQty} unidad${totalQty === 1 ? "" : "es"} en ${items.length} producto${items.length === 1 ? "" : "s"}`,
  ];
}
