import { describe, it, expect } from "vitest";
import {
  BODY_TEXT, BODY_EXAMPLE, BUTTON_URL, TEMPLATE_NAME, TEMPLATE_LANG, TEMPLATE_CATEGORY, templatePayload, renderMessage, templateValuesFromQuote,
} from "../../scripts/whatsapp-sandbox/template-def.mjs";
import { buildTemplateBodyParams } from "./whatsappNotificationJob";
import type { CatalogQuoteItem } from "@/types";

describe("plantilla nueva_solicitud_cotizacion — contrastada con lo que envía el código", () => {
  const vars = (BODY_TEXT.match(/\{\{\d+\}\}/g) ?? []).map((m) => Number(m.replace(/\D/g, "")));

  it("las variables son secuenciales y coinciden en número con los parámetros que arma el código", () => {
    expect(vars).toEqual([1, 2, 3, 4, 5]);
    const items: CatalogQuoteItem[] = [{ inventoryId: "p", sku: "S", productName: "P", category: "C", quantity: 1, unitPriceCents: 1, isBackorder: false }];
    const params = buildTemplateBodyParams({ businessName: "N", customerName: "C", customerPhone: "+18095551234", publicRef: "R", items });
    expect(params).toHaveLength(vars.length);
    expect(BODY_EXAMPLE).toHaveLength(vars.length);
  });

  it("regla de Meta: el cuerpo no empieza ni termina con una variable, y cabe en 1024 caracteres", () => {
    expect(BODY_TEXT.trimStart().startsWith("{{")).toBe(false);
    expect(BODY_TEXT.trimEnd().endsWith("}}")).toBe(false);
    expect(BODY_TEXT.length).toBeLessThanOrEqual(1024);
  });

  it("el nombre, idioma y categoría son los que usa el código por defecto", () => {
    expect(TEMPLATE_NAME).toBe("nueva_solicitud_cotizacion");
    expect(TEMPLATE_NAME).toMatch(/^[a-z0-9_]+$/);
    expect(TEMPLATE_LANG).toBe("es");
    expect(TEMPLATE_CATEGORY).toBe("UTILITY");
  });

  it("el botón de URL tiene UNA variable al final y la URL es la de la app (que exige sesión)", () => {
    expect(BUTTON_URL).toBe("https://logianalytics-pro-v2.vercel.app/solicitudes?ref={{1}}");
    expect(BUTTON_URL.endsWith("{{1}}")).toBe(true);
    expect(BUTTON_URL.match(/\{\{/g)).toHaveLength(1);
  });

  it("el payload para Meta lleva ejemplos de cuerpo y de botón", () => {
    const p = templatePayload();
    expect(p.components[0].example?.body_text[0]).toEqual(BODY_EXAMPLE);
    expect(p.components[1].buttons?.[0].example).toHaveLength(1);
  });

  it("el mensaje que se muestra para aprobar (templateValuesFromQuote) es IDÉNTICO al que arma el código al enviar", () => {
    const mk = (quantity: number): CatalogQuoteItem => ({ inventoryId: "p" + quantity, sku: "S", productName: "P", category: "C", quantity, unitPriceCents: 100, isBackorder: false });
    const cases = [
      { items: [mk(2)], customerName: "Cliente Ficticio (prueba)", customerPhone: "+18095550100" },
      { items: [mk(1)], customerName: "María Pérez", customerPhone: "+18295550123" },
      { items: [mk(3), mk(1), mk(5)], customerName: "Ñandú Gómez", customerPhone: "+34600123456" },
    ];
    for (const c of cases) {
      const base = { businessName: "PRUEBA AISLADA LogiAnalytics", publicRef: "PAL-ABC123", ...c };
      expect(templateValuesFromQuote(base)).toEqual(buildTemplateBodyParams(base));
    }
  });

  it("renderMessage acepta la URL del botón del entorno (sandbox o producción)", () => {
    expect(renderMessage(["a", "b", "c", "d", "e"], "id1", "https://sandbox.example/solicitudes?ref={{1}}")).toContain("https://sandbox.example/solicitudes?ref=id1");
    expect(renderMessage(["a", "b", "c", "d", "e"], "id1")).toContain("https://logianalytics-pro-v2.vercel.app/solicitudes?ref=id1");
  });

  it("renderMessage muestra el texto final sin variables sin resolver", () => {
    const out = renderMessage(["Negocio", "Cliente", "+1 809 555 0100", "PAL-ABC123", "2 unidades en 1 producto"], "quote1");
    expect(out).not.toMatch(/\{\{\d\}\}/);
    expect(out).toContain("Nueva solicitud de cotización para Negocio.");
    expect(out).toContain("solicitudes?ref=quote1");
  });
});
