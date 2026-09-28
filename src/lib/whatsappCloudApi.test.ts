import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsappTemplateMessage } from "./whatsappCloudApi";

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
    expect(body.to).toBe("+18095551234");
    expect(body.template.name).toBe("nueva_solicitud_catalogo");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "María", "+1 809 555 1234", "SC-ABC123", "4 unidades", "https://x/y",
    ]);
  });

  it("error 5xx de Meta: reintentable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }),
    });
    const r = await sendWhatsappTemplateMessage({ config, to: "+18095551234", templateName: "x", languageCode: "es", bodyParams: [] });
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
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
