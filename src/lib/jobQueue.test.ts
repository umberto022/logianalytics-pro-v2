import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleWorkerWake } from "./jobQueue";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); delete process.env.QSTASH_TOKEN; delete process.env.QSTASH_URL; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.QSTASH_TOKEN; });

describe("scheduleWorkerWake", () => {
  it("sin QSTASH_TOKEN es un no-op explícito (no llama a la red)", async () => {
    const r = await scheduleWorkerWake({ workspaceId: "w", quoteId: "q", attempt: 1, delaySeconds: 120 });
    expect(r).toEqual({ published: false, reason: "qstash_not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publica un mensaje diferido al worker, con dedup por solicitud+intento", async () => {
    process.env.QSTASH_TOKEN = "qtok";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201 });
    const r = await scheduleWorkerWake({ workspaceId: "w1", quoteId: "q1", attempt: 2, delaySeconds: 240 });
    expect(r.published).toBe(true);
    const [url, opts] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://qstash.upstash.io/v2/publish/https://logianalytics-pro-v2.vercel.app/api/cron/process-whatsapp-notifications");
    expect(opts.headers.Authorization).toBe("Bearer qtok");
    expect(opts.headers["Upstash-Delay"]).toBe("240s");
    expect(opts.headers["Upstash-Deduplication-Id"]).toBe("wa-q1-2");
    expect(JSON.parse(opts.body)).toEqual({ workspaceId: "w1", quoteId: "q1" });
  });

  it("nunca lanza: un fallo de la cola se devuelve como resultado (la solicitud no se ve afectada)", async () => {
    process.env.QSTASH_TOKEN = "qtok";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("red caída"));
    expect(await scheduleWorkerWake({ workspaceId: "w", quoteId: "q", attempt: 1, delaySeconds: 1 })).toEqual({ published: false, reason: "qstash_unreachable" });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    expect(await scheduleWorkerWake({ workspaceId: "w", quoteId: "q", attempt: 1, delaySeconds: 1 })).toEqual({ published: false, reason: "qstash_http_429" });
  });
});
