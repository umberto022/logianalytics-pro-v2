// Autorización de las llamadas al worker de avisos — server-only.
//
// Dos formas legítimas de llamar al worker, ambas FALLAN CERRADO:
//  1. Bearer con CRON_SECRET (cron de Vercel, disparo manual). Si CRON_SECRET no
//     está definido o está vacío, esta vía queda deshabilitada — antes,
//     `Bearer ${undefined}` ("Bearer undefined") habría sido una credencial válida.
//  2. Firma de QStash (Upstash-Signature, JWT HS256): se acepta solo si hay
//     claves de firma configuradas y el JWT es válido para ESTA url y ESTE cuerpo.
import { createHash, createHmac, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyBearerSecret(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorizationHeader) return false;
  return safeEqual(authorizationHeader, `Bearer ${secret}`);
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function verifyJwtWithKey(token: string, key: string, rawBody: string, url: string, nowSeconds: number): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  try {
    const header = JSON.parse(fromB64url(h).toString("utf8"));
    if (header.alg !== "HS256") return false; // sin "none" ni otros algoritmos
    const expected = b64url(createHmac("sha256", key).update(`${h}.${p}`).digest());
    if (!safeEqual(expected, s)) return false;
    const claims = JSON.parse(fromB64url(p).toString("utf8"));
    if (claims.iss !== "Upstash") return false;
    if (typeof claims.exp !== "number" || claims.exp < nowSeconds) return false;
    if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 5) return false;
    if (claims.sub !== url) return false;
    const bodyHash = b64url(createHash("sha256").update(rawBody, "utf8").digest());
    return typeof claims.body === "string" && claims.body.replace(/=+$/, "") === bodyHash;
  } catch {
    return false;
  }
}

/** Verifica `Upstash-Signature` contra la clave actual y, si falla, la siguiente (rotación de claves). */
export function verifyQstashSignature(params: {
  signature: string | null;
  rawBody: string;
  url: string;
  currentKey?: string;
  nextKey?: string;
  nowSeconds?: number;
}): boolean {
  if (!params.signature) return false;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const keys = [params.currentKey, params.nextKey].filter((k): k is string => !!k);
  if (keys.length === 0) return false;
  return keys.some((k) => verifyJwtWithKey(params.signature!, k, params.rawBody, params.url, now));
}

export type WorkerAuthResult = { ok: true; via: "bearer" | "qstash" } | { ok: false };

export function authorizeWorkerRequest(params: {
  authorizationHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  url: string; // URL pública exacta a la que QStash llamó
  env?: Record<string, string | undefined>;
}): WorkerAuthResult {
  const env = params.env ?? process.env;
  if (verifyBearerSecret(params.authorizationHeader, env.CRON_SECRET)) return { ok: true, via: "bearer" };
  if (verifyQstashSignature({
    signature: params.signatureHeader, rawBody: params.rawBody, url: params.url,
    currentKey: env.QSTASH_CURRENT_SIGNING_KEY, nextKey: env.QSTASH_NEXT_SIGNING_KEY,
  })) return { ok: true, via: "qstash" };
  return { ok: false };
}
