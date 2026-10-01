import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsappTemplateMessage, sanitizeTemplateParam } from "./whatsappCloudApi";

const config = { accessToken: "test-token", phoneNumberId: "123456" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("sendWhatsappTemplateMessage", () => {
  it("éxito: devuelve ok:true con el messageId de Meta", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.ABC123" }] }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: ["a"] });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("wamid.ABC123");
  });

  it("envía el body con el formato exacto que espera la Graph API", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }),
    });
    await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "nueva_solicitud_catalogo", languageCode: "es", bodyParams: ["María", "+1 809 555 1234", "SC-ABC123", "4 unidades", "https://x/y"] });
    const [url, opts] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/123456/messages");
    expect(opts.headers.Authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("+18095551234"); // E.164 con "+", como pide la doc oficial
    expect(body.template.name).toBe("nueva_solicitud_catalogo");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "María", "+1 809 555 1234", "SC-ABC123", "4 unidades", "https://x/y",
    ]);
  });

  it("error 5xx de Meta CON cuerpo de error: reintentable y NO ambiguo (Meta respondió que no lo creó)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.ambiguous).toBeUndefined();
  });

  it("5xx SIN cuerpo de error reconocible (gateway): ambiguo — no sabemos si quedó encolado", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("html"); } });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.ok).toBe(false);
    expect(r.ambiguous).toBe(true);
  });

  it("200 sin wamid: ambiguo, nunca se cuenta como enviado", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.ok).toBe(false);
    expect(r.ambiguous).toBe(true);
  });

  it("rate limit de Meta (code 130429): reintentable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 429, json: async () => ({ error: { message: "Rate limit hit", code: 130429 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.retryable).toBe(true);
  });

  it("plantilla inválida (code 132000): NO reintentable — no tiene sentido reintentar un error permanente", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { message: "Template not found", code: 132000 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.retryable).toBe(false);
  });

  it("token vencido (code 190): NO reintentable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: { message: "Invalid OAuth token", code: 190 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.retryable).toBe(false);
  });

  it("errorSafe nunca incluye el token de acceso", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: { message: "Invalid OAuth token", code: 190 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.errorSafe).not.toContain("test-token");
  });

  it("timeout de red: ambiguo (no sabemos si Meta llegó a procesarlo) pero reintentable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), 5))
    );
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [], timeoutMs: 1 });
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.ambiguous).toBe(true);
  });
});

describe("sendWhatsappTemplateMessage — botón de URL y dato de correlación", () => {
  it("agrega el componente de botón con el sufijo dinámico y biz_opaque_callback_data", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }) });
    await sendWhatsappTemplateMessage({
      config, to: "+18095551234", templateName: "t", languageCode: "es", bodyParams: ["a"],
      buttonUrlParam: "quote123", callbackData: "wa1|ws|quote123|1",
    });
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.template.components[1]).toEqual({
      type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "quote123" }],
    });
    expect(body.biz_opaque_callback_data).toBe("wa1|ws|quote123|1");
  });

  it("sin botón ni callback, no manda esos campos", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }) });
    await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "t", languageCode: "es", bodyParams: ["a"] });
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.template.components).toHaveLength(1);
    expect(body).not.toHaveProperty("biz_opaque_callback_data");
  });
});

describe("sanitizeTemplateParam — texto de visitantes dentro de la plantilla", () => {
  it("quita saltos de línea, tabs y espacios repetidos (Meta los rechaza)", () => {
    expect(sanitizeTemplateParam("María\n  Pérez\t\tGómez")).toBe("María Pérez Gómez");
  });
  it("un parámetro vacío se reemplaza por un guion (Meta no acepta vacíos)", () => {
    expect(sanitizeTemplateParam("   \n ")).toBe("-");
  });
  it("recorta textos largos", () => {
    expect(sanitizeTemplateParam("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});
