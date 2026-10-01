import { describe, it, expect } from "vitest";
import { classifyOrigin, decodeInspectorEntry, describeWebhookBody, syntheticInit, SYNTHETIC_HEADER, shouldAlertWatcher } from "../../scripts/whatsapp-sandbox/meta-origin.mjs";

describe("classifyOrigin — lo sintético nunca se confunde con Meta", () => {
  it("Meta real: User-Agent facebookplatform / facebookexternalua / facebookexternalhit", () => {
    expect(classifyOrigin({ "User-Agent": ["facebookplatform/1.0 (+http://developers.facebook.com)"] })).toBe("META");
    expect(classifyOrigin({ "User-Agent": ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"] })).toBe("META");
    expect(classifyOrigin({ "User-Agent": ["facebookexternalua/1.0"] })).toBe("META");
    // POST REAL de webhook observado el 2026-09-30: User-Agent "facebookexternalua" SIN versión (antes se clasificaba mal como OTRO).
    expect(classifyOrigin({ "User-Agent": ["facebookexternalua"] })).toBe("META");
  });

  it("la cabecera de sintético GANA aunque el User-Agent se haga pasar por Meta", () => {
    expect(classifyOrigin({ "X-Sandbox-Synthetic": ["1"], "User-Agent": ["facebookplatform/1.0"] })).toBe("SINTETICO");
    expect(classifyOrigin({ "x-sandbox-synthetic": "1" })).toBe("SINTETICO");
  });

  it("nuestros scripts se identifican con syntheticInit y quedan como SINTETICO", () => {
    const init = syntheticInit({ method: "POST", headers: { "content-type": "application/json" } });
    expect(init.headers[SYNTHETIC_HEADER]).toBe("1");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(classifyOrigin(init.headers)).toBe("SINTETICO");
  });

  it("todo lo demás (node, curl, navegadores, sin UA) es OTRO, nunca META", () => {
    for (const ua of ["node", "curl/8.0", "Mozilla/5.0 Chrome/120", "", "notfacebookplatform/1.0"]) {
      expect(classifyOrigin({ "User-Agent": [ua] }), ua).toBe("OTRO");
    }
    expect(classifyOrigin({})).toBe("OTRO");
  });
});

describe("decodeInspectorEntry y describeWebhookBody", () => {
  const rawOf = (headersLines: string[], body: string) => Buffer.from(`POST /api/webhooks/whatsapp HTTP/1.1\r\n${headersLines.join("\r\n")}\r\n\r\n${body}`).toString("base64");

  it("decodifica el cuerpo y describe un aviso de plantilla SIN datos personales", () => {
    const body = JSON.stringify({ entry: [{ changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "nueva_solicitud_cotizacion", reason: "NONE" } }] }] });
    const e = decodeInspectorEntry({
      id: "x1", start: "2026-09-29T21:00:00Z", response: { status_code: 200 },
      request: { method: "POST", uri: "/api/webhooks/whatsapp", headers: { "User-Agent": ["facebookplatform/1.0"], "X-Hub-Signature-256": ["sha256=abc"] }, raw: rawOf(["Host: x"], body) },
    });
    expect(e).toMatchObject({ origin: "META", signed: true, status: 200, method: "POST", path: "/api/webhooks/whatsapp" });
    expect(describeWebhookBody(e.body)).toEqual(["plantilla nueva_solicitud_cotizacion → APPROVED"]);
  });

  it("un evento generado por nuestros scripts se decodifica como SINTETICO", () => {
    const e = decodeInspectorEntry({
      id: "x2", start: "2026-09-29T21:00:00Z", response: { status_code: 200 },
      request: { method: "POST", uri: "/api/webhooks/whatsapp", headers: { "User-Agent": ["sandbox-synthetic/1"], "X-Sandbox-Synthetic": ["1"] }, raw: rawOf([], "{}") },
    });
    expect(e.origin).toBe("SINTETICO");
    expect(e.signed).toBe(false);
  });

  it("describe estados de mensaje sin revelar teléfonos ni ids", () => {
    const d = describeWebhookBody({ entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.SECRETO", status: "delivered", recipient_id: "18295550123" }] } }] }] });
    expect(d).toEqual(["estado de mensaje delivered"]);
    expect(JSON.stringify(d)).not.toContain("18295550123");
    expect(JSON.stringify(d)).not.toContain("SECRETO");
  });

  it("un cuerpo vacío o basura no rompe", () => {
    expect(describeWebhookBody(null)).toEqual(["(sin cambios reconocibles)"]);
    expect(describeWebhookBody({ entry: "x" })).toEqual(["(sin cambios reconocibles)"]);
  });
});

describe("shouldAlertWatcher — solo un POST REAL de Meta despierta al vigilante", () => {
  const e = (origin: string, method = "POST", path = "/api/webhooks/whatsapp") => ({ origin, method, path });
  it("POST de Meta al webhook: sí", () => {
    expect(shouldAlertWatcher(e("META"))).toBe(true);
  });
  it("lo sintético y lo desconocido: NUNCA (aunque sea un POST al webhook con firma válida)", () => {
    expect(shouldAlertWatcher(e("SINTETICO"))).toBe(false);
    expect(shouldAlertWatcher(e("OTRO"))).toBe(false);
  });
  it("visitas de Meta que no son POST al webhook (verificación GET, rastreo del botón): no", () => {
    expect(shouldAlertWatcher(e("META", "GET"))).toBe(false);
    expect(shouldAlertWatcher(e("META", "GET", "/solicitudes"))).toBe(false);
    expect(shouldAlertWatcher(e("META", "POST", "/otra-ruta"))).toBe(false);
  });
});
