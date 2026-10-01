import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import { authorizeWorkerRequest, verifyBearerSecret, verifyQstashSignature } from "./workerAuth";

const SECRET = "una-clave-larga-de-16+chars";
const URL_ = "https://logianalytics-pro-v2.vercel.app/api/cron/process-whatsapp-notifications";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function signQstash(opts: { key: string; body: string; url?: string; iss?: string; exp?: number; nbf?: number; alg?: string }) {
  const header = b64({ alg: opts.alg ?? "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({
    iss: opts.iss ?? "Upstash", sub: opts.url ?? URL_, exp: opts.exp ?? now + 300, nbf: opts.nbf ?? now - 1, iat: now,
    body: createHash("sha256").update(opts.body).digest("base64url"),
  });
  const sig = createHmac("sha256", opts.key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

describe("verifyBearerSecret — falla cerrado", () => {
  it("con el secreto correcto autoriza", () => {
    expect(verifyBearerSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("CRON_SECRET ausente: 'Bearer undefined' NO autoriza (el bug anterior)", () => {
    expect(verifyBearerSecret("Bearer undefined", undefined)).toBe(false);
    expect(verifyBearerSecret("Bearer ", "")).toBe(false);
    expect(verifyBearerSecret("Bearer undefined", "undefined")).toBe(false); // secreto demasiado corto
  });
  it("secreto incorrecto o sin cabecera", () => {
    expect(verifyBearerSecret("Bearer otra-clave-larga-16chars", SECRET)).toBe(false);
    expect(verifyBearerSecret(null, SECRET)).toBe(false);
  });
});

describe("verifyQstashSignature", () => {
  const key = "sig-key-current";
  const next = "sig-key-next";
  const body = JSON.stringify({ workspaceId: "w", quoteId: "q" });

  it("firma válida con la clave actual", () => {
    const sig = signQstash({ key, body });
    expect(verifyQstashSignature({ signature: sig, rawBody: body, url: URL_, currentKey: key, nextKey: next })).toBe(true);
  });
  it("acepta la clave siguiente (rotación)", () => {
    const sig = signQstash({ key: next, body });
    expect(verifyQstashSignature({ signature: sig, rawBody: body, url: URL_, currentKey: key, nextKey: next })).toBe(true);
  });
  it("rechaza cuerpo alterado, URL distinta, emisor distinto, vencida, alg none y clave desconocida", () => {
    const sig = signQstash({ key, body });
    expect(verifyQstashSignature({ signature: sig, rawBody: body + " ", url: URL_, currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: sig, rawBody: body, url: URL_ + "/x", currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: signQstash({ key, body, iss: "Otro" }), rawBody: body, url: URL_, currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: signQstash({ key, body, exp: 1 }), rawBody: body, url: URL_, currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: signQstash({ key, body, alg: "none" }), rawBody: body, url: URL_, currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: sig, rawBody: body, url: URL_, currentKey: "otra" })).toBe(false);
  });
  it("sin claves configuradas o sin cabecera: rechaza", () => {
    expect(verifyQstashSignature({ signature: signQstash({ key, body }), rawBody: body, url: URL_ })).toBe(false);
    expect(verifyQstashSignature({ signature: null, rawBody: body, url: URL_, currentKey: key })).toBe(false);
    expect(verifyQstashSignature({ signature: "basura", rawBody: body, url: URL_, currentKey: key })).toBe(false);
  });
});

describe("authorizeWorkerRequest", () => {
  it("sin ninguna credencial configurada, nada autoriza", () => {
    expect(authorizeWorkerRequest({ authorizationHeader: "Bearer undefined", signatureHeader: null, rawBody: "", url: URL_, env: {} }).ok).toBe(false);
  });
  it("Bearer o QStash, según lo configurado", () => {
    expect(authorizeWorkerRequest({ authorizationHeader: `Bearer ${SECRET}`, signatureHeader: null, rawBody: "", url: URL_, env: { CRON_SECRET: SECRET } }))
      .toEqual({ ok: true, via: "bearer" });
    const body = "{}";
    expect(authorizeWorkerRequest({
      authorizationHeader: null, signatureHeader: signQstash({ key: "k", body }), rawBody: body, url: URL_, env: { QSTASH_CURRENT_SIGNING_KEY: "k" },
    })).toEqual({ ok: true, via: "qstash" });
  });
});
