import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  shouldApplyWebhookStatus, buildTemplateBodyParams, orderSummary, buildCallbackData, parseCallbackData,
  evaluateFreshness, normalizeRecipient, backoffMinutes, DEFAULT_MAX_AGE_MINUTES,
} from "./whatsappNotificationJob";
import type { CatalogQuoteItem } from "@/types";

describe("shouldApplyWebhookStatus — idempotencia y orden de los webhooks de Meta", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("aplica el primer evento (sent) sobre un job aceptado", () => {
    expect(shouldApplyWebhookStatus({ status: "accepted" }, { status: "sent", timestampSeconds: nowSec })).toBe(true);
  });

  it("progresa sent → delivered → read", () => {
    expect(shouldApplyWebhookStatus({ status: "sent" }, { status: "delivered", timestampSeconds: nowSec })).toBe(true);
    expect(shouldApplyWebhookStatus({ status: "delivered" }, { status: "read", timestampSeconds: nowSec + 5 })).toBe(true);
  });

  it("NO retrocede: un 'sent' duplicado/tardío no pisa un 'delivered' ya aplicado", () => {
    expect(shouldApplyWebhookStatus({ status: "delivered" }, { status: "sent", timestampSeconds: nowSec })).toBe(false);
  });

  it("Meta reenvía el MISMO evento (mismo timestamp, mismo status) — no reaplica", () => {
    const lastStatusAt = Timestamp.fromMillis(nowSec * 1000);
    expect(shouldApplyWebhookStatus({ status: "delivered", lastStatusAt }, { status: "delivered", timestampSeconds: nowSec })).toBe(false);
  });

  it("evento fuera de orden (timestamp más viejo que el último aplicado) se ignora", () => {
    const lastStatusAt = Timestamp.fromMillis(nowSec * 1000);
    expect(shouldApplyWebhookStatus({ status: "sent", lastStatusAt }, { status: "delivered", timestampSeconds: nowSec - 60 })).toBe(false);
  });

  it("'failed' se registra incluso después de 'sent' (falló la entrega)", () => {
    expect(shouldApplyWebhookStatus({ status: "sent" }, { status: "failed", timestampSeconds: nowSec })).toBe(true);
  });

  it("un 'failed' tardío/espurio NO pisa un 'delivered' ya confirmado", () => {
    expect(shouldApplyWebhookStatus({ status: "delivered" }, { status: "failed", timestampSeconds: nowSec })).toBe(false);
    expect(shouldApplyWebhookStatus({ status: "read" }, { status: "failed", timestampSeconds: nowSec })).toBe(false);
  });

  it("un 'failed' repetido sobre un job ya 'failed' no reaplica", () => {
    expect(shouldApplyWebhookStatus({ status: "failed" }, { status: "failed", timestampSeconds: nowSec })).toBe(false);
  });

  it("'delivered' es evidencia de que sí llegó: reconcilia un envío 'unconfirmed' (timeout ambiguo)", () => {
    expect(shouldApplyWebhookStatus({ status: "unconfirmed" }, { status: "delivered", timestampSeconds: nowSec })).toBe(true);
    expect(shouldApplyWebhookStatus({ status: "unconfirmed" }, { status: "sent", timestampSeconds: nowSec })).toBe(true);
  });

  it("un evento posterior de entrega corrige un 'failed' anterior; uno ANTERIOR al fallo no", () => {
    const lastStatusAt = Timestamp.fromMillis(nowSec * 1000);
    expect(shouldApplyWebhookStatus({ status: "failed", lastStatusAt }, { status: "delivered", timestampSeconds: nowSec + 10 })).toBe(true);
    expect(shouldApplyWebhookStatus({ status: "failed", lastStatusAt }, { status: "sent", timestampSeconds: nowSec - 10 })).toBe(false);
  });

  it("un webhook puede adelantarse al cierre del envío: aplica sobre 'sending'", () => {
    expect(shouldApplyWebhookStatus({ status: "sending" }, { status: "sent", timestampSeconds: nowSec })).toBe(true);
  });
});

describe("buildTemplateBodyParams — orden exacto {{1}}..{{5}} de la plantilla", () => {
  const items: CatalogQuoteItem[] = [
    { inventoryId: "p1", sku: "S1", productName: "Tulipanes", category: "Flores", quantity: 3, unitPriceCents: 1000, isBackorder: false },
    { inventoryId: "p2", sku: "S2", productName: "Rosas", category: "Flores", quantity: 1, unitPriceCents: 2000, isBackorder: false },
  ];

  it("arma negocio, cliente, WhatsApp internacional, referencia y resumen de unidades", () => {
    const params = buildTemplateBodyParams({
      businessName: "Stefany's Creations", customerName: "María Pérez", customerPhone: "+18095551234",
      publicRef: "SC-ABC123", items,
    });
    expect(params).toEqual(["Stefany's Creations", "María Pérez", "+1 809 555 1234", "SC-ABC123", "4 unidades en 2 productos"]);
  });

  it("singular correcto", () => {
    expect(orderSummary([items[1]])).toBe("1 unidad en 1 producto");
  });
});

describe("callback data — correlación de webhooks con su trabajo", () => {
  it("ida y vuelta", () => {
    expect(parseCallbackData(buildCallbackData("wsUid1", "quoteAbc", 3))).toEqual({ workspaceId: "wsUid1", quoteId: "quoteAbc", attempt: 3 });
  });
  it("rechaza formatos ajenos o con separadores de ruta (no puede armar rutas de Firestore arbitrarias)", () => {
    expect(parseCallbackData(undefined)).toBeNull();
    expect(parseCallbackData("otro|formato")).toBeNull();
    expect(parseCallbackData("wa1|ws/../x|q|1")).toBeNull();
    expect(parseCallbackData("wa1|ws|q|0")).toBeNull();
    expect(parseCallbackData("wa1|ws|q|x")).toBeNull();
  });
});

describe("evaluateFreshness — un aviso viejo nunca sale al activar credenciales", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it("reciente = fresh", () => {
    expect(evaluateFreshness(now - 60_000, now, {})).toBe("fresh");
  });
  it("pasada la edad máxima por defecto = too_old", () => {
    expect(evaluateFreshness(now - (DEFAULT_MAX_AGE_MINUTES + 1) * 60_000, now, {})).toBe("too_old");
  });
  it("la edad máxima es configurable", () => {
    expect(evaluateFreshness(now - 20 * 60_000, now, { WHATSAPP_JOB_MAX_AGE_MINUTES: "10" })).toBe("too_old");
    expect(evaluateFreshness(now - 20 * 60_000, now, { WHATSAPP_JOB_MAX_AGE_MINUTES: "30" })).toBe("fresh");
  });
  it("WHATSAPP_SEND_NOT_BEFORE descarta todo lo creado antes de la activación", () => {
    const env = { WHATSAPP_SEND_NOT_BEFORE: "2026-10-01T11:59:00Z" };
    expect(evaluateFreshness(now - 3 * 60_000, now, env)).toBe("before_activation");
    expect(evaluateFreshness(now - 30_000, now, env)).toBe("fresh");
  });
});

describe("normalizeRecipient — receptor de la configuración protegida", () => {
  it("acepta los formatos que escribe una persona", () => {
    expect(normalizeRecipient("+1 829 555 0123")).toBe("+18295550123");
    expect(normalizeRecipient("18295550123")).toBe("+18295550123");
    expect(normalizeRecipient("(829) 347-8941")).toBeNull(); // sin código de país no se adivina
  });
  it("rechaza vacío o inválido", () => {
    expect(normalizeRecipient("")).toBeNull();
    expect(normalizeRecipient(undefined)).toBeNull();
    expect(normalizeRecipient("+1 111")).toBeNull();
  });
});

describe("backoffMinutes — espera progresiva con tope", () => {
  it("2, 4, 8, 16, 32 y tope en 60", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(backoffMinutes)).toEqual([2, 4, 8, 16, 32, 60, 60]);
  });
});
