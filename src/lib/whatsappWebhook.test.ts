import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { isSafeChallenge, parseStatusWebhook, verifyHandshakeToken, verifyMetaSignature } from "./whatsappWebhook";

const OURS = { phoneNumberId: "PN_OURS", businessAccountId: "WABA_OURS" };

function payload(overrides: { phoneId?: string; waba?: string; statuses?: unknown[] } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: overrides.waba ?? "WABA_OURS",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "15551651639", phone_number_id: overrides.phoneId ?? "PN_OURS" },
          statuses: overrides.statuses ?? [{
            id: "wamid.AAA", status: "delivered", timestamp: "1790000000", recipient_id: "18295550123",
            biz_opaque_callback_data: "wa1|ws|q|1",
          }],
        },
      }],
    }],
  };
}

describe("verifyMetaSignature", () => {
  const body = JSON.stringify(payload());
  const sign = (b: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(b, "utf8").digest("hex");
  it("acepta la firma correcta sobre el cuerpo crudo", () => {
    expect(verifyMetaSignature(body, sign(body, "app-secret"), "app-secret")).toBe(true);
  });
  it("rechaza firma incorrecta, cuerpo alterado, prefijo ausente y App Secret ausente (falla cerrado)", () => {
    expect(verifyMetaSignature(body, sign(body, "otro"), "app-secret")).toBe(false);
    expect(verifyMetaSignature(body + " ", sign(body, "app-secret"), "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, sign(body, "app-secret").slice(7), "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, sign(body, "undefined"), undefined)).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
  });
});

describe("handshake GET", () => {
  it("token: exige coincidencia y falla cerrado si no hay token configurado", () => {
    expect(verifyHandshakeToken("abc", "abc")).toBe(true);
    expect(verifyHandshakeToken("abc", "abd")).toBe(false);
    expect(verifyHandshakeToken("undefined", undefined)).toBe(false);
    expect(verifyHandshakeToken("", "")).toBe(false);
  });
  it("challenge: solo alfanumérico corto (no refleja HTML)", () => {
    expect(isSafeChallenge("1158201444")).toBe(true);
    expect(isSafeChallenge("<script>alert(1)</script>")).toBe(false);
    expect(isSafeChallenge(null)).toBe(false);
  });
});

describe("parseStatusWebhook", () => {
  it("extrae el estado con su wamid, timestamp y dato de correlación", () => {
    const r = parseStatusWebhook(payload(), OURS);
    expect(r.events).toEqual([{ wamid: "wamid.AAA", status: "delivered", timestampSeconds: 1790000000, callbackData: "wa1|ws|q|1" }]);
    expect(r.foreignChanges).toBe(0);
  });
  it("ignora eventos de OTRA cuenta emisora o de otra WABA", () => {
    expect(parseStatusWebhook(payload({ phoneId: "PN_AJENO" }), OURS)).toMatchObject({ events: [], foreignChanges: 1 });
    expect(parseStatusWebhook(payload({ waba: "WABA_AJENA" }), OURS)).toMatchObject({ events: [], foreignChanges: 1 });
  });
  it("sin nuestro Phone Number ID configurado, nada se considera nuestro (falla cerrado)", () => {
    expect(parseStatusWebhook(payload(), {})).toMatchObject({ events: [], foreignChanges: 1 });
  });
  it("estados que no seguimos o mal formados se omiten", () => {
    const r = parseStatusWebhook(payload({ statuses: [
      { id: "wamid.1", status: "deleted", timestamp: "1" },
      { id: "wamid.2", status: "read", timestamp: "no-es-numero" },
      { status: "read", timestamp: "5" },
      { id: "wamid.3", status: "read", timestamp: "5" },
    ] }), OURS);
    expect(r.events.map((e) => e.wamid)).toEqual(["wamid.3"]);
    expect(r.skipped).toBe(3);
  });
  it("'failed' guarda un resumen seguro del error (código + título), nunca el objeto crudo", () => {
    const r = parseStatusWebhook(payload({ statuses: [{
      id: "wamid.F", status: "failed", timestamp: "10", recipient_id: "18295550123",
      errors: [{ code: 131026, title: "Message undeliverable", message: "detalle largo", error_data: { details: "x" } }],
    }] }), OURS);
    expect(r.events[0].errorSafe).toBe("Meta 131026: Message undeliverable");
    expect(JSON.stringify(r.events)).not.toContain("18295550123");
  });
  it("mensajes ENTRANTES y otros campos no se procesan", () => {
    const p = payload();
    (p.entry[0].changes[0].value as Record<string, unknown>).messages = [{ from: "18295550123", text: { body: "hola" } }];
    delete (p.entry[0].changes[0].value as Record<string, unknown>).statuses;
    expect(parseStatusWebhook(p, OURS).events).toEqual([]);
    const other = payload(); other.entry[0].changes[0].field = "account_update";
    expect(parseStatusWebhook(other, OURS).events).toEqual([]);
  });
  it("avisos de estado de plantilla de NUESTRA WABA se informan (solo nombre, estado y motivo), sin tocar mensajes", () => {
    const p = { object: "whatsapp_business_account", entry: [{ id: "WABA_OURS", changes: [{ field: "message_template_status_update", value: {
      event: "REJECTED", message_template_id: 1, message_template_name: "nueva_solicitud_cotizacion", message_template_language: "es", reason: "INVALID_FORMAT" } }] }] };
    expect(parseStatusWebhook(p, OURS)).toMatchObject({ events: [], templateUpdates: [{ name: "nueva_solicitud_cotizacion", event: "REJECTED", reason: "INVALID_FORMAT" }] });
    const ok = { ...p, entry: [{ id: "WABA_OURS", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "x", reason: "NONE" } }] }] };
    expect(parseStatusWebhook(ok, OURS).templateUpdates).toEqual([{ name: "x", event: "APPROVED" }]);
  });
  it("avisos de plantilla de OTRA WABA se ignoran", () => {
    const p = { object: "whatsapp_business_account", entry: [{ id: "WABA_AJENA", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "x" } }] }] };
    expect(parseStatusWebhook(p, OURS).templateUpdates).toEqual([]);
  });
  it("payload basura no revienta", () => {
    expect(parseStatusWebhook(null, OURS).events).toEqual([]);
    expect(parseStatusWebhook({ object: "page" }, OURS).events).toEqual([]);
    expect(parseStatusWebhook({ object: "whatsapp_business_account", entry: "x" }, OURS).events).toEqual([]);
  });
});
