import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { shouldApplyWebhookStatus, buildTemplateBodyParams, buildQuoteDeepLink } from "./whatsappNotificationJob";
import type { CatalogQuoteItem } from "@/types";

describe("shouldApplyWebhookStatus — idempotencia y orden de los webhooks de Meta", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("aplica el primer evento (sent) sobre un job recién creado", () => {
    expect(shouldApplyWebhookStatus({ status: "pending" }, { status: "sent", timestampSeconds: nowSec })).toBe(true);
  });

  it("progresa sent → delivered → read", () => {
    expect(shouldApplyWebhookStatus({ status: "sent" }, { status: "delivered", timestampSeconds: nowSec })).toBe(true);
    expect(shouldApplyWebhookStatus({ status: "delivered" }, { status: "read", timestampSeconds: nowSec + 5 })).toBe(true);
  });

  it("NO retrocede: un 'sent' duplicado/tardío no pisa un 'delivered' ya aplicado", () => {
    expect(shouldApplyWebhookStatus({ status: "delivered" }, { status: "sent", timestampSeconds: nowSec })).toBe(false);
  });

  it("Meta reenvía el MISMO evento (mismo timestamp, mismo status) — se ignora, no falla pero tampoco reaplica", () => {
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
  });
});

describe("buildTemplateBodyParams — orden exacto {{1}}..{{5}} del template aprobado", () => {
  const items: CatalogQuoteItem[] = [
    { inventoryId: "p1", sku: "S1", productName: "Tulipanes", category: "Flores", quantity: 3, unitPriceCents: 1000, isBackorder: false },
    { inventoryId: "p2", sku: "S2", productName: "Rosas", category: "Flores", quantity: 1, unitPriceCents: 2000, isBackorder: false },
  ];

  it("arma los 5 parámetros en el orden del ejemplo de Stefany", () => {
    const params = buildTemplateBodyParams({
      customerName: "María Pérez",
      customerPhonePretty: "+1 809 555 1234",
      publicRef: "SC-ABC123",
      items,
      quoteId: "q1",
    });
    expect(params[0]).toBe("María Pérez");
    expect(params[1]).toBe("+1 809 555 1234");
    expect(params[2]).toBe("SC-ABC123");
    expect(params[3]).toBe("4 unidades"); // 3 + 1 = 4, coincide con el ejemplo
    expect(params[4]).toBe(buildQuoteDeepLink("q1"));
    expect(params[4]).toContain("/solicitudes?ref=q1");
  });

  it("singular correcto para 1 unidad", () => {
    const params = buildTemplateBodyParams({
      customerName: "X", customerPhonePretty: "+1 809 555 0000", publicRef: "R",
      items: [items[1]], quoteId: "q2",
    });
    expect(params[3]).toBe("1 unidad");
  });
});
