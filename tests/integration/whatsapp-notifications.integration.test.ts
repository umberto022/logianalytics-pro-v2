// Recorrido integrado del aviso automático por WhatsApp — código REAL de la
// app (rutas reales, lib real) contra Firestore+Auth EMULADOS. Meta NUNCA se
// llama de verdad: global.fetch se mockea y solo se simula la respuesta de
// graph.facebook.com. Requiere los mismos emuladores que
// tests/integration/catalog-flow.integration.test.ts (`npm run test:integration`).
//
// Qué demuestra esta suite (y qué NO): que la LÓGICA del servidor es correcta
// frente a concurrencia, timeouts ambiguos, config ausente, avisos viejos y
// eventos duplicados/desordenados. NO demuestra que Meta acepte la plantilla ni
// que un mensaje real llegue — eso solo lo prueba una entrega real (ver
// WHATSAPP_SETUP.md, "Prueba de extremo a extremo").
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDocs, collection } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ensureCatalogSettings, updateCatalogSettings } from "@/lib/firestore/catalogSettings";
import { addInventoryItem, updateInventoryItem } from "@/lib/firestore/inventory";
import { claimJob, finalizeAttempt, applyStatusEvent, processJob, processDueJobs } from "@/lib/whatsappNotificationJob";

const ADMIN_UID = "int-wa-admin";
const PASSWORD = "test-password-123!";
const APP_SECRET = "test-app-secret";
const PHONE_ID = "test-phone-id";
const WABA_ID = "test-waba-id";
const CRON_SECRET = "test-cron-secret-long-enough";
const RECEPTOR = "+18095559999"; // Stefany (receptor) — distinto del emisor y de cualquier cliente

function setDefaultEnv() {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID;
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = WABA_ID;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  process.env.WHATSAPP_SENDING_ENABLED = "true";
  delete process.env.WHATSAPP_TEMPLATE_NAME;
  delete process.env.WHATSAPP_SEND_NOT_BEFORE;
  delete process.env.WHATSAPP_JOB_MAX_AGE_MINUTES;
  delete process.env.QSTASH_TOKEN;
  delete process.env.QSTASH_CURRENT_SIGNING_KEY;
  delete process.env.QSTASH_NEXT_SIGNING_KEY;
  process.env.WHATSAPP_TEMPLATE_LANG = "es";
  process.env.APP_BASE_URL = "https://logianalytics-pro-v2.vercel.app";
  process.env.CRON_SECRET = CRON_SECRET;
}
setDefaultEnv();

async function seedUser(uid: string, email: string, data: Record<string, unknown>) {
  await getAdminAuth().createUser({ uid, email, password: PASSWORD }).catch(() => {});
  await getAdminDb().collection("users").doc(uid).set({ email, createdAt: new Date(), ...data });
}

async function signIn(email: string) {
  return (await signInWithEmailAndPassword(auth, email, PASSWORD)).user;
}

async function callSolicitudRoute(slug: string, body: unknown) {
  const { POST } = await import("@/app/api/catalogo/[slug]/solicitud/route");
  const req = new NextRequest(`http://localhost/api/catalogo/${slug}/solicitud`, {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
  const res = await POST(req, { params: { slug } });
  return { status: res.status, json: await res.json() };
}

function signMeta(rawBody: string): string {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
}

async function callWebhook(rawBody: string, signature: string, extraHeaders: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const req = new NextRequest("http://localhost/api/webhooks/whatsapp", {
    method: "POST", body: rawBody, headers: { "x-hub-signature-256": signature, ...extraHeaders },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

async function callHandshake(query: string) {
  const { GET } = await import("@/app/api/webhooks/whatsapp/route");
  const res = await GET(new NextRequest(`http://localhost/api/webhooks/whatsapp?${query}`));
  return { status: res.status, text: await res.text() };
}

async function callWorker(opts: { authorization?: string | null; method?: "GET" | "POST"; body?: unknown } = {}) {
  const route = await import("@/app/api/cron/process-whatsapp-notifications/route");
  const headers: Record<string, string> = {};
  const authorization = opts.authorization === undefined ? `Bearer ${CRON_SECRET}` : opts.authorization;
  if (authorization) headers.authorization = authorization;
  const method = opts.method ?? "GET";
  const req = new NextRequest("http://localhost/api/cron/process-whatsapp-notifications", {
    method, headers, ...(method === "POST" && opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const res = await (method === "GET" ? route.GET(req) : route.POST(req));
  return { status: res.status, json: await res.json() };
}

const jobDoc = (quoteId: string) =>
  getAdminDb().collection("whatsappNotifications").doc(ADMIN_UID).collection("jobs").doc(quoteId);
async function getJob(quoteId: string) {
  const snap = await jobDoc(quoteId).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as any) : null;
}
async function eventCount(quoteId: string) {
  return (await jobDoc(quoteId).collection("events").get()).size;
}
async function quoteIdByRef(publicRef: string) {
  const snap = await getAdminDb().collection("catalogQuotes").doc(ADMIN_UID).collection("records").where("publicRef", "==", publicRef).get();
  expect(snap.size).toBe(1);
  return snap.docs[0].id;
}

// ─── Mock de Meta ────────────────────────────────────────────────────────────
// El stub de `fetch` se instala UNA sola vez (top-level beforeAll): el Auth SDK
// y Firestore hablan con el emulador vía fetch y esas llamadas se dejan pasar;
// SOLO se simula la respuesta de graph.facebook.com y se registra cada llamada.
type MetaResponder = (call: { url: string; body: any }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
const realFetch = globalThis.fetch;
const metaOk = (id = "wamid.TEST"): MetaResponder => async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id }] }) });
let responder: MetaResponder = metaOk();
let metaCalls: Array<{ url: string; body: any }> = [];
let qstashCalls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
let qstashResponder: () => Promise<{ ok: boolean; status: number }> = async () => ({ ok: true, status: 201 });
// Un producto publicado + slug, compartidos por todos los describe (se crean en el beforeAll de abajo;
// Vitest 1.x corre los hooks de un mismo nivel EN PARALELO, por eso todo el armado va en UN solo beforeAll).
let productId: string;
let slug: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("127.0.0.1") || url.includes("localhost")) return realFetch(input, init);
    if (url.includes("qstash.upstash.io")) {
      qstashCalls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : null });
      return qstashResponder() as unknown as Response;
    }
    const call = { url, body: init?.body ? JSON.parse(init.body as string) : null };
    metaCalls.push(call);
    return responder(call) as unknown as Response;
  }));

  await realFetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-logianalytics-test/databases/(default)/documents`,
    { method: "DELETE" }
  ).catch(() => {});
  await seedUser(ADMIN_UID, "admin-wa@integration.test", {
    role: "admin", workspaceId: ADMIN_UID, enabledModules: ["catalogo"], fullName: "Admin WA",
  });
  await signIn("admin-wa@integration.test");
  await ensureCatalogSettings(ADMIN_UID, "Empresa WhatsApp Test");
  await updateCatalogSettings(ADMIN_UID, {
    enabled: true,
    whatsappNumber: RECEPTOR,
    whatsappNotificationsConsent: true,
    pickup: { enabled: true, address: "Calle Test 1" },
  });
  const added = await addInventoryItem(ADMIN_UID, {
    name: "Producto WA", category: "Test", color: "", supplier: "",
    currentStock: 500, minStock: 1, maxStock: 1000, unitCost: 50, salePrice: 100, leadTimeDays: 3,
  });
  productId = added.id!;
  await updateInventoryItem(ADMIN_UID, productId, {
    catalog: { published: true, variants: [{ id: "vA", label: "Color: Rojo" }, { id: "vB", label: "Color: Azul" }] },
  });
  const { getCatalogSettings } = await import("@/lib/firestore/catalogSettings");
  slug = (await getCatalogSettings(ADMIN_UID))!.publicSlug;
});

afterAll(async () => {
  await getAdminAuth().deleteUser(ADMIN_UID).catch(() => {});
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  setDefaultEnv();
  responder = metaOk();
  metaCalls = [];
  qstashCalls = [];
  qstashResponder = async () => ({ ok: true, status: 201 });
  // Cada test parte sin jobs previos: el barrido procesa TODO lo vencido, así que un job huérfano
  // de otro test contaminaría el conteo de llamadas a Meta.
  const adb = getAdminDb();
  await adb.recursiveDelete(adb.collection("whatsappNotifications").doc(ADMIN_UID).collection("jobs"));
});

let phoneCounter = 0;
const nextPhone = () => `+1809555${String(2000 + phoneCounter++)}`;

async function newQuote(overrides: Record<string, unknown> = {}) {
  const { json } = await callSolicitudRoute(slug, {
    items: [{ inventoryId: productId, quantity: 2 }],
    customerName: "Cliente Prueba", customerPhone: nextPhone(), deliveryMethod: "retiro", ...overrides,
  });
  expect(json.ok).toBe(true);
  return { publicRef: json.publicRef as string, quoteId: await quoteIdByRef(json.publicRef) };
}

/** Deja un job "pending" SIN llamar a Meta: interruptor encendido pero sin credenciales (no se puede enviar, el job se crea igual). */
async function newPendingJob(overrides: Record<string, unknown> = {}) {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  const q = await newQuote(overrides);
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  return q;
}

function statusBody(
  events: Array<{ id: string; status: string; ts: number; cb?: string }>,
  opts: { phoneId?: string; waba?: string } = {}
) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: opts.waba ?? WABA_ID,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "15551651639", phone_number_id: opts.phoneId ?? PHONE_ID },
          statuses: events.map((e) => ({
            id: e.id, status: e.status, timestamp: String(e.ts), recipient_id: "18095559999",
            ...(e.cb ? { biz_opaque_callback_data: e.cb } : {}),
          })),
        },
      }],
    }],
  });
}
const nowSec = () => Math.floor(Date.now() / 1000);

// ─────────────────────────────────────────────────────────────────────────────

describe("Solicitud → job atómico → plantilla enviada al receptor protegido", () => {
  it("guarda cotización + job, y envía NUESTRA plantilla al receptor configurado (nunca al cliente); queda 'accepted', no 'delivered'", async () => {
    responder = metaOk("wamid.INLINE1");
    const customerPhone = "+18095551001";
    const { publicRef, quoteId } = await newQuote({ items: [{ inventoryId: productId, variantId: "vA", quantity: 2 }], customerName: "Cliente WA 1", customerPhone });

    expect(metaCalls).toHaveLength(1);
    const { url, body } = metaCalls[0];
    expect(url).toContain(`/${PHONE_ID}/messages`);
    expect(body.to).toBe(RECEPTOR); // receptor de la configuración protegida
    expect(JSON.stringify(body)).not.toContain(customerPhone.slice(1)); // el teléfono del visitante no viaja como destinatario
    expect(body.template.name).toBe("nueva_solicitud_cotizacion");
    expect(body.template.language.code).toBe("es");
    const bodyParams = body.template.components[0].parameters.map((p: { text: string }) => p.text);
    expect(bodyParams).toEqual(["Empresa WhatsApp Test", "Cliente WA 1", "+1 809 555 1001", publicRef, "2 unidades en 1 producto"]);
    expect(body.template.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: quoteId }] });
    expect(body.biz_opaque_callback_data).toBe(`wa1|${ADMIN_UID}|${quoteId}|1`);

    const job = await getJob(quoteId);
    expect(job.status).toBe("accepted"); // Meta aceptó; NO significa entregado
    expect(job.providerMessageId).toBe("wamid.INLINE1");
    expect(job.attempts).toBe(1);
    expect(job.recipientPhone).toBe(RECEPTOR);
  });

  it("un nombre con saltos de línea/tabs no rompe la plantilla (se sanea antes de enviar)", async () => {
    await newQuote({ customerName: "Ana\n   Gómez\tPérez" });
    const bodyParams = metaCalls[0].body.template.components[0].parameters.map((p: { text: string }) => p.text);
    expect(bodyParams[1]).toBe("Ana Gómez Pérez");
  });

  it("variantes distintas del mismo producto NO se confunden como duplicado", async () => {
    const phone = nextPhone();
    const a = await newQuote({ items: [{ inventoryId: productId, variantId: "vA", quantity: 1 }], customerPhone: phone });
    const b = await newQuote({ items: [{ inventoryId: productId, variantId: "vB", quantity: 1 }], customerPhone: phone });
    expect(a.publicRef).not.toBe(b.publicRef);
  });

  it("la MISMA solicitud repetida (doble click) se deduplica: una cotización, un job, un solo envío", async () => {
    const body = { items: [{ inventoryId: productId, variantId: "vA", quantity: 1 }], customerName: "Cliente Doble", customerPhone: nextPhone(), deliveryMethod: "retiro" as const };
    const first = await callSolicitudRoute(slug, body);
    const second = await callSolicitudRoute(slug, body);
    expect(first.json.publicRef).toBe(second.json.publicRef);
    expect(metaCalls).toHaveLength(1);
  });

  it("CONCURRENCIA: 6 solicitudes idénticas SIMULTÁNEAS crean una sola cotización, un solo job, un solo cliente y un solo envío", async () => {
    responder = async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.CONC" }] }) }; };
    const phone = nextPhone();
    const body = { items: [{ inventoryId: productId, quantity: 3 }], customerName: "Cliente Concurrente", customerPhone: phone, deliveryMethod: "retiro" as const };
    const results = await Promise.all(Array.from({ length: 6 }, () => callSolicitudRoute(slug, body)));

    expect(new Set(results.map((r) => r.json.publicRef)).size).toBe(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const quotes = await getAdminDb().collection("catalogQuotes").doc(ADMIN_UID).collection("records").where("customerPhone", "==", phone).get();
    expect(quotes.size).toBe(1);
    expect((await jobDoc(quotes.docs[0].id).get()).exists).toBe(true);
    const customers = await getAdminDb().collection("customers").doc(ADMIN_UID).collection("records").where("phone", "==", phone).get();
    expect(customers.size).toBe(1);
    expect(metaCalls).toHaveLength(1);
  });

  it("CONCURRENCIA: solicitudes DISTINTAS del mismo teléfono nuevo simultáneas no duplican al cliente", async () => {
    const phone = nextPhone();
    const results = await Promise.all([1, 2, 3, 4].map((q) => callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, quantity: q }], customerName: "Cliente Nuevo", customerPhone: phone, deliveryMethod: "retiro",
    })));
    expect(new Set(results.map((r) => r.json.publicRef)).size).toBe(4);
    const customers = await getAdminDb().collection("customers").doc(ADMIN_UID).collection("records").where("phone", "==", phone).get();
    expect(customers.size).toBe(1);
  });

  it("receptor de la configuración con formato inválido: la solicitud se guarda y el job nace 'failed' con motivo claro, sin llamar a Meta", async () => {
    await updateCatalogSettings(ADMIN_UID, { whatsappNumber: "no-es-un-numero" });
    try {
      const { quoteId } = await newQuote();
      const job = await getJob(quoteId);
      expect(job.status).toBe("failed");
      expect(job.lastErrorSafe).toContain("no es un número válido");
      expect(metaCalls).toHaveLength(0);
    } finally {
      await updateCatalogSettings(ADMIN_UID, { whatsappNumber: RECEPTOR });
    }
  });

  it("sin consentimiento no se crea ningún job ni se llama a Meta", async () => {
    await updateCatalogSettings(ADMIN_UID, { whatsappNotificationsConsent: false });
    try {
      const { quoteId } = await newQuote();
      expect(await getJob(quoteId)).toBeNull();
      expect(metaCalls).toHaveLength(0);
    } finally {
      await updateCatalogSettings(ADMIN_UID, { whatsappNotificationsConsent: true });
    }
  });
});

describe("Toma atómica y configuración ausente", () => {
  it("con el interruptor APAGADO no se crea NINGÚN aviso (la bandeja de la empresa queda limpia) y no se llama a Meta; la solicitud se guarda igual", async () => {
    process.env.WHATSAPP_SENDING_ENABLED = "false";
    const { publicRef, quoteId } = await newQuote();
    expect(publicRef).toBeTruthy();
    expect(await getJob(quoteId)).toBeNull();
    expect(metaCalls).toHaveLength(0);
    delete process.env.WHATSAPP_SENDING_ENABLED; // ausente = apagado, igual que en producción hoy
    const second = await newQuote();
    expect(await getJob(second.quoteId)).toBeNull();
  });

  it("con el interruptor ENCENDIDO pero SIN credenciales, el job queda 'pending', NO consume intentos y NO llama a Meta", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { quoteId } = await newQuote();
    let job = await getJob(quoteId);
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);
    expect(job.lastErrorSafe).toContain("no está configurada");
    await processDueJobs(getAdminDb());
    job = await getJob(quoteId);
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);
    expect(metaCalls).toHaveLength(0);
  });

  it("8 workers SIMULTÁNEOS sobre el mismo job: Meta se llama UNA sola vez", async () => {
    const { quoteId } = await newPendingJob();
    responder = async () => { await new Promise((r) => setTimeout(r, 60)); return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.RACE" }] }) }; };
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => processJob(getAdminDb(), ADMIN_UID, quoteId)));
    expect(metaCalls).toHaveLength(1);
    expect(outcomes.filter((o) => o.attempted)).toHaveLength(1);
    const job = await getJob(quoteId);
    expect(job.status).toBe("accepted");
    expect(job.attempts).toBe(1);
  });

  it("el envío en línea y el barrido programado simultáneos tampoco duplican", async () => {
    const { quoteId } = await newPendingJob();
    responder = async () => { await new Promise((r) => setTimeout(r, 60)); return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.RACE2" }] }) }; };
    await Promise.all([
      processJob(getAdminDb(), ADMIN_UID, quoteId),
      callWorker(),
      callWorker({ method: "POST", body: { workspaceId: ADMIN_UID, quoteId } }),
    ]);
    expect(metaCalls.filter((c) => c.body.biz_opaque_callback_data === `wa1|${ADMIN_UID}|${quoteId}|1`)).toHaveLength(1);
  });

  it("un lease VIGENTE de otro worker no se pisa", async () => {
    const { quoteId } = await newPendingJob();
    const claim = await claimJob(getAdminDb(), jobDoc(quoteId), { canSend: true });
    expect(claim.kind).toBe("claimed");
    const second = await processJob(getAdminDb(), ADMIN_UID, quoteId);
    expect(second.attempted).toBe(false);
    expect(second.reason).toBe("in_progress");
    expect(metaCalls).toHaveLength(0);
  });

  it("lease VENCIDO (el worker murió): pasa a 'unconfirmed', NO se reenvía a ciegas", async () => {
    const { quoteId } = await newPendingJob();
    await jobDoc(quoteId).update({ status: "sending", leaseOwner: "worker-muerto", attempts: 1, nextAttemptAt: new Date(Date.now() - 1000) });
    const summary = await processDueJobs(getAdminDb());
    expect(summary.scanned).toBeGreaterThanOrEqual(1);
    const job = await getJob(quoteId);
    expect(job.status).toBe("unconfirmed");
    expect(job.lastErrorSafe).toContain("no se sabe si Meta lo procesó");
    expect(metaCalls).toHaveLength(0);
  });

  it("solo el dueño del lease cierra el intento: un cierre tardío de un worker viejo no pisa el estado", async () => {
    const { quoteId } = await newPendingJob();
    const claim = await claimJob(getAdminDb(), jobDoc(quoteId), { canSend: true });
    if (claim.kind !== "claimed") throw new Error("no se pudo tomar");
    await jobDoc(quoteId).update({ status: "delivered" }); // otro camino ya avanzó el job
    const status = await finalizeAttempt(getAdminDb(), jobDoc(quoteId), claim, { ok: false, errorSafe: "x", retryable: true });
    expect(status).toBe("delivered");
    expect((await getJob(quoteId)).status).toBe("delivered");
  });
});

describe("Errores, backoff y timeout ambiguo", () => {
  it("error reintentable (5xx con cuerpo de error) → 'pending' con backoff; un barrido inmediato NO reintenta antes de tiempo", async () => {
    responder = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }) });
    const { quoteId } = await newQuote();
    const job = await getJob(quoteId);
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt.toMillis()).toBeGreaterThan(Date.now());
    await processDueJobs(getAdminDb());
    expect(metaCalls).toHaveLength(1); // el barrido no lo tocó: no venció el backoff
  });

  it("al vencer el backoff, el barrido reintenta y el job queda 'accepted'", async () => {
    responder = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }) });
    const { quoteId } = await newQuote();
    await jobDoc(quoteId).update({ nextAttemptAt: new Date(Date.now() - 1000) });
    responder = metaOk("wamid.CRON_OK");
    const { status, json } = await callWorker();
    expect(status).toBe(200);
    expect(json.mode).toBe("sweep");
    const job = await getJob(quoteId);
    expect(job.status).toBe("accepted");
    expect(job.attempts).toBe(2);
    expect(metaCalls[1].body.biz_opaque_callback_data).toBe(`wa1|${ADMIN_UID}|${quoteId}|2`);
  });

  it("agota los intentos → 'failed' (no reintenta para siempre)", async () => {
    responder = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }) });
    const { quoteId } = await newQuote();
    for (let i = 0; i < 6; i++) {
      await jobDoc(quoteId).update({ nextAttemptAt: new Date(Date.now() - 1000) });
      await processDueJobs(getAdminDb());
    }
    const job = await getJob(quoteId);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(5);
    expect(metaCalls).toHaveLength(5);
  });

  it("error PERMANENTE (plantilla inválida) → 'failed' de inmediato", async () => {
    responder = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Template not found", code: 132000 } }) });
    const { quoteId } = await newQuote();
    const job = await getJob(quoteId);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
  });

  it("TIMEOUT AMBIGUO: queda 'unconfirmed', NO se reenvía en el siguiente barrido", async () => {
    responder = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
    const { quoteId } = await newQuote();
    let job = await getJob(quoteId);
    expect(job.status).toBe("unconfirmed");
    expect(job.attempts).toBe(1);
    expect(job.reconcileUntil.toMillis()).toBeGreaterThan(Date.now());
    expect(job.lastErrorSafe).toContain("ambigua");

    await jobDoc(quoteId).update({ nextAttemptAt: new Date(Date.now() - 1000) });
    responder = metaOk("wamid.NO_DEBERIA");
    await processDueJobs(getAdminDb());
    await callWorker({ method: "POST", body: { workspaceId: ADMIN_UID, quoteId } });
    job = await getJob(quoteId);
    expect(job.status).toBe("unconfirmed");
    expect(metaCalls).toHaveLength(1); // ningún reenvío ciego
  });

  it("RECONCILIACIÓN: el webhook trae de vuelta el dato de correlación y el job 'unconfirmed' pasa a 'delivered' aunque nunca vimos el wamid", async () => {
    responder = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
    const { quoteId } = await newQuote();
    expect((await getJob(quoteId)).providerMessageId).toBeUndefined();

    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const body = statusBody([{ id: "wamid.LLEGO_IGUAL", status: "delivered", ts: nowSec(), cb }]);
    const { status, json } = await callWebhook(body, signMeta(body));
    expect(status).toBe(200);
    expect(json.applied).toBe(1);
    const job = await getJob(quoteId);
    expect(job.status).toBe("delivered");
    expect(job.providerMessageId).toBe("wamid.LLEGO_IGUAL");
    expect(job.reconcileUntil).toBeUndefined();
  });

  it("\"Reintentar aviso\" reabre un job 'failed' y, si Meta responde bien, queda 'accepted'; usa el receptor VIGENTE de la configuración", async () => {
    responder = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Template not found", code: 132000 } }) });
    const { quoteId } = await newQuote();
    expect((await getJob(quoteId)).status).toBe("failed");

    await updateCatalogSettings(ADMIN_UID, { whatsappNumber: "+18095550000" }); // Stefany corrige su número
    responder = metaOk("wamid.RETRY_OK");
    const user = await signIn("admin-wa@integration.test");
    const token = await user.getIdToken();
    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const res = await POST(new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    }));
    const json = await res.json();
    await updateCatalogSettings(ADMIN_UID, { whatsappNumber: RECEPTOR });
    expect(json.ok).toBe(true);
    const job = await getJob(quoteId);
    expect(job.status).toBe("accepted");
    expect(job.recipientPhone).toBe("+18095550000");
    expect(metaCalls[1].body.to).toBe("+18095550000");
    expect(metaCalls[1].body.biz_opaque_callback_data).toBe(`wa1|${ADMIN_UID}|${quoteId}|2`); // el número de intento sigue siendo único
  });

  it("el reintento manual también rechaza estados que no corresponden (p. ej. ya 'delivered')", async () => {
    const { quoteId } = await newQuote();
    await jobDoc(quoteId).update({ status: "delivered" });
    const user = await signIn("admin-wa@integration.test");
    const token = await user.getIdToken();
    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const res = await POST(new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(400);
  });

  it("otra empresa NO puede reintentar el job de esta empresa (aislamiento)", async () => {
    const quotesSnap = await getAdminDb().collection("catalogQuotes").doc(ADMIN_UID).collection("records").limit(1).get();
    const anyQuoteId = quotesSnap.docs[0].id;
    await seedUser("int-wa-admin-b", "admin-wa-b@integration.test", {
      role: "admin", workspaceId: "int-wa-admin-b", enabledModules: ["catalogo"], fullName: "Admin WA B",
    });
    const otherUser = await signIn("admin-wa-b@integration.test");
    const token = await otherUser.getIdToken();
    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const res = await POST(new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId: anyQuoteId }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(404);
    await getAdminAuth().deleteUser("int-wa-admin-b").catch(() => {});
    await signIn("admin-wa@integration.test");
  });
});

describe("Cola de despertadores (QStash) y llamadas firmadas al worker", () => {
  it("un fallo reintentable publica UN mensaje diferido con el backoff del job; el job ya está persistido en Firestore", async () => {
    process.env.QSTASH_TOKEN = "qtok";
    responder = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }) });
    const { quoteId } = await newQuote();
    expect(qstashCalls).toHaveLength(1);
    expect(qstashCalls[0].url).toContain("/v2/publish/https://logianalytics-pro-v2.vercel.app/api/cron/process-whatsapp-notifications");
    expect(qstashCalls[0].headers["Upstash-Delay"]).toBe("120s"); // backoff del intento 1 = 2 min
    expect(qstashCalls[0].body).toEqual({ workspaceId: ADMIN_UID, quoteId });
    expect((await getJob(quoteId)).status).toBe("pending"); // la verdad está en Firestore, no en la cola
  });

  it("si la cola falla, la solicitud y el job quedan intactos (se levanta en el siguiente barrido)", async () => {
    process.env.QSTASH_TOKEN = "qtok";
    qstashResponder = async () => ({ ok: false, status: 503 });
    responder = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }) });
    const { quoteId } = await newQuote();
    const job = await getJob(quoteId);
    expect(job.status).toBe("pending");
    expect(job.nextAttemptAt.toMillis()).toBeGreaterThan(Date.now());
  });

  it("un envío exitoso NO publica mensajes en la cola", async () => {
    process.env.QSTASH_TOKEN = "qtok";
    await newQuote();
    expect(qstashCalls).toHaveLength(0);
  });

  it("el worker acepta una llamada con firma de QStash válida (sin CRON_SECRET) y rechaza firma o cuerpo que no coinciden", async () => {
    delete process.env.CRON_SECRET;
    process.env.QSTASH_CURRENT_SIGNING_KEY = "qstash-signing-key";
    const { quoteId } = await newPendingJob();
    const url = "https://logianalytics-pro-v2.vercel.app/api/cron/process-whatsapp-notifications";
    const bodyStr = JSON.stringify({ workspaceId: ADMIN_UID, quoteId });
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = (body: string, key: string) => {
      const h = b64({ alg: "HS256", typ: "JWT" });
      const now = Math.floor(Date.now() / 1000);
      const p = b64({ iss: "Upstash", sub: url, exp: now + 300, nbf: now - 1, iat: now, body: crypto.createHash("sha256").update(body).digest("base64url") });
      return `${h}.${p}.${crypto.createHmac("sha256", key).update(`${h}.${p}`).digest("base64url")}`;
    };
    const route = await import("@/app/api/cron/process-whatsapp-notifications/route");
    const call = (signature: string, body: string) => route.POST(new NextRequest("http://localhost/api/cron/process-whatsapp-notifications", {
      method: "POST", body, headers: { "upstash-signature": signature },
    }));

    expect((await call(jwt(bodyStr, "otra-clave"), bodyStr)).status).toBe(401);
    expect((await call(jwt(bodyStr, "qstash-signing-key"), bodyStr + " ")).status).toBe(401); // cuerpo alterado
    expect(metaCalls).toHaveLength(0);
    const ok = await call(jwt(bodyStr, "qstash-signing-key"), bodyStr);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ mode: "job", via: "qstash", status: "accepted" });
  });
});

describe("Activar credenciales NO reprocesa avisos viejos", () => {
  it("con credenciales recién activadas, los jobs de hace días pasan a 'expired' y NO se envían; el reciente sí", async () => {
    const old1 = await newPendingJob();
    const old2 = await newPendingJob();
    const fresh = await newPendingJob();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    for (const q of [old1, old2]) await jobDoc(q.quoteId).update({ createdAt: twoDaysAgo, freshSince: twoDaysAgo });

    await processDueJobs(getAdminDb());

    expect((await getJob(old1.quoteId)).status).toBe("expired");
    expect((await getJob(old2.quoteId)).status).toBe("expired");
    expect((await getJob(fresh.quoteId)).status).toBe("accepted");
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].body.biz_opaque_callback_data).toContain(fresh.quoteId);
  });

  it("WHATSAPP_SEND_NOT_BEFORE: lo creado antes de la activación no sale nunca automáticamente", async () => {
    const before = await newPendingJob();
    await new Promise((r) => setTimeout(r, 1100));
    process.env.WHATSAPP_SEND_NOT_BEFORE = new Date().toISOString();
    await processDueJobs(getAdminDb());
    const job = await getJob(before.quoteId);
    expect(job.status).toBe("expired");
    expect(job.lastErrorSafe).toContain("anterior a la activación");
    expect(metaCalls).toHaveLength(0);
  });

  it("un aviso 'expired' se puede reabrir a mano y SÍ sale (acción humana explícita)", async () => {
    const q = await newPendingJob();
    await jobDoc(q.quoteId).update({ createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000), freshSince: new Date(Date.now() - 3 * 24 * 3600 * 1000) });
    await processDueJobs(getAdminDb());
    expect((await getJob(q.quoteId)).status).toBe("expired");

    const user = await signIn("admin-wa@integration.test");
    const token = await user.getIdToken();
    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const res = await POST(new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId: q.quoteId }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    }));
    expect((await res.json()).status).toBe("accepted");
  });
});

describe("Worker: autorización que falla cerrado", () => {
  it("rechaza sin cabecera, con secreto incorrecto, y con 'Bearer undefined' cuando CRON_SECRET no existe", async () => {
    expect((await callWorker({ authorization: null })).status).toBe(401);
    expect((await callWorker({ authorization: "Bearer incorrecto" })).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await callWorker({ authorization: "Bearer undefined" })).status).toBe(401);
    expect((await callWorker({ authorization: "Bearer " })).status).toBe(401);
    expect((await callWorker({ authorization: "Bearer undefined", method: "POST", body: { workspaceId: ADMIN_UID, quoteId: "x" } })).status).toBe(401);
  });

  it("con el secreto correcto acepta, y un cuerpo con ids inválidos se trata como barrido (no arma rutas arbitrarias)", async () => {
    const { status, json } = await callWorker({ method: "POST", body: { workspaceId: "../otro", quoteId: "x/y" } });
    expect(status).toBe(200);
    expect(json.mode).toBe("sweep");
  });
});

describe("Webhook de Meta", () => {
  it("handshake GET: devuelve el challenge solo con el token correcto; sin token configurado, nunca", async () => {
    expect(await callHandshake("hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=1158201444"))
      .toEqual({ status: 200, text: "1158201444" });
    expect((await callHandshake("hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1158201444")).status).toBe(403);
    expect((await callHandshake("hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=%3Cscript%3E")).status).toBe(403);
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    expect((await callHandshake("hub.mode=subscribe&hub.verify_token=undefined&hub.challenge=1")).status).toBe(403);
  });

  it("firma inválida o sin App Secret: 401 y no toca nada", async () => {
    const { quoteId } = await newQuote();
    const body = statusBody([{ id: "wamid.TEST", status: "delivered", ts: nowSec(), cb: `wa1|${ADMIN_UID}|${quoteId}|1` }]);
    expect((await callWebhook(body, "sha256=firma-falsa")).status).toBe(401);
    expect((await callWebhook(body, signMeta(body + " "))).status).toBe(401);
    delete process.env.WHATSAPP_APP_SECRET;
    expect((await callWebhook(body, signMeta(body))).status).toBe(401);
    expect((await getJob(quoteId)).status).toBe("accepted");
    expect(await eventCount(quoteId)).toBe(0);
  });

  it("con firma válida aplica accepted → sent → delivered → read, asociado al MISMO mensaje", async () => {
    responder = metaOk("wamid.E2E");
    const { quoteId } = await newQuote();
    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const t = nowSec();
    const progression = ["sent", "delivered", "read"] as const;
    for (let i = 0; i < progression.length; i++) {
      const st = progression[i];
      const body = statusBody([{ id: "wamid.E2E", status: st, ts: t + i, cb }]);
      const { status, json } = await callWebhook(body, signMeta(body));
      expect(status).toBe(200);
      expect(json.applied).toBe(1);
      expect((await getJob(quoteId)).status).toBe(st);
    }
    const job = await getJob(quoteId);
    expect(job.providerMessageId).toBe("wamid.E2E");
    expect(await eventCount(quoteId)).toBe(3);
  });

  it("también encuentra el job por wamid cuando el evento no trae dato de correlación", async () => {
    responder = metaOk("wamid.SOLO_WAMID");
    const { quoteId } = await newQuote();
    const body = statusBody([{ id: "wamid.SOLO_WAMID", status: "delivered", ts: nowSec() }]);
    const { json } = await callWebhook(body, signMeta(body));
    expect(json.applied).toBe(1);
    expect((await getJob(quoteId)).status).toBe("delivered");
  });

  it("DUPLICADO: reenvío del mismo evento es un no-op (un solo registro)", async () => {
    responder = metaOk("wamid.DUP_EVT");
    const { quoteId } = await newQuote();
    const body = statusBody([{ id: "wamid.DUP_EVT", status: "delivered", ts: nowSec(), cb: `wa1|${ADMIN_UID}|${quoteId}|1` }]);
    const first = await callWebhook(body, signMeta(body));
    const second = await callWebhook(body, signMeta(body));
    expect(first.json.applied).toBe(1);
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBe(1);
    expect(await eventCount(quoteId)).toBe(1);
  });

  it("FUERA DE ORDEN: un 'sent' viejo que llega después de 'read' no retrocede el estado (pero queda registrado)", async () => {
    responder = metaOk("wamid.ORDEN");
    const { quoteId } = await newQuote();
    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const t = nowSec();
    const read = statusBody([{ id: "wamid.ORDEN", status: "read", ts: t + 10, cb }]);
    await callWebhook(read, signMeta(read));
    const late = statusBody([{ id: "wamid.ORDEN", status: "sent", ts: t, cb }]);
    const { json } = await callWebhook(late, signMeta(late));
    expect(json.recordedNoChange).toBe(1);
    expect((await getJob(quoteId)).status).toBe("read");
  });

  it("CONCURRENCIA: 'delivered' y 'read' simultáneos (y repetidos) terminan siempre en 'read'", async () => {
    responder = metaOk("wamid.PAR");
    const { quoteId } = await newQuote();
    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const t = nowSec();
    const delivered = statusBody([{ id: "wamid.PAR", status: "delivered", ts: t, cb }]);
    const read = statusBody([{ id: "wamid.PAR", status: "read", ts: t + 1, cb }]);
    const calls = [];
    for (let i = 0; i < 5; i++) { calls.push(callWebhook(delivered, signMeta(delivered)), callWebhook(read, signMeta(read))); }
    const results = await Promise.all(calls);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await getJob(quoteId)).status).toBe("read");
    expect(await eventCount(quoteId)).toBe(2);
  });

  it("'failed' de Meta se registra con resumen seguro; un 'failed' tardío no pisa 'delivered'", async () => {
    responder = metaOk("wamid.FAIL");
    const { quoteId } = await newQuote();
    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const t = nowSec();
    const failedBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: WABA_ID, changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{
        id: "wamid.FAIL", status: "failed", timestamp: String(t), recipient_id: "18095559999", biz_opaque_callback_data: cb,
        errors: [{ code: 131026, title: "Message undeliverable", message: "texto largo", error_data: { details: "detalle" } }],
      }] } }] }],
    });
    await callWebhook(failedBody, signMeta(failedBody));
    let job = await getJob(quoteId);
    expect(job.status).toBe("failed");
    expect(job.lastErrorSafe).toBe("Meta 131026: Message undeliverable");

    const delivered = statusBody([{ id: "wamid.FAIL", status: "delivered", ts: t + 5, cb }]);
    await callWebhook(delivered, signMeta(delivered));
    expect((await getJob(quoteId)).status).toBe("delivered"); // evidencia posterior de entrega corrige
    const lateFailed = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: WABA_ID, changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{
        id: "wamid.FAIL", status: "failed", timestamp: String(t + 20), biz_opaque_callback_data: cb, errors: [{ code: 1, title: "x" }],
      }] } }] }],
    });
    await callWebhook(lateFailed, signMeta(lateFailed));
    job = await getJob(quoteId);
    expect(job.status).toBe("delivered");
  });

  it("CUENTA EMISORA AJENA: eventos de otro phone_number_id / WABA se ignoran sin tocar el job", async () => {
    responder = metaOk("wamid.AJENO");
    const { quoteId } = await newQuote();
    const cb = `wa1|${ADMIN_UID}|${quoteId}|1`;
    const otherPhone = statusBody([{ id: "wamid.AJENO", status: "read", ts: nowSec(), cb }], { phoneId: "OTRO_NUMERO" });
    const otherWaba = statusBody([{ id: "wamid.AJENO", status: "read", ts: nowSec(), cb }], { waba: "OTRA_WABA" });
    expect((await callWebhook(otherPhone, signMeta(otherPhone))).json.foreignChanges).toBe(1);
    expect((await callWebhook(otherWaba, signMeta(otherWaba))).json.foreignChanges).toBe(1);
    expect((await getJob(quoteId)).status).toBe("accepted");
    expect(await eventCount(quoteId)).toBe(0);
  });

  it("mensaje que no es nuestro (p. ej. el hello_world enviado desde el panel de Meta): se ignora con 200", async () => {
    const body = statusBody([{ id: "wamid.HELLO_WORLD_PANEL", status: "read", ts: nowSec() }]);
    const { status, json } = await callWebhook(body, signMeta(body));
    expect(status).toBe(200);
    expect(json.noJob).toBe(1);
  });

  it("el webhook puede ADELANTARSE al cierre del envío: el estado avanzado se conserva y el wamid se completa", async () => {
    const { quoteId } = await newPendingJob();
    const claim = await claimJob(getAdminDb(), jobDoc(quoteId), { canSend: true });
    if (claim.kind !== "claimed") throw new Error("no se pudo tomar");
    // Meta responde y su webhook 'sent' llega ANTES de que nuestro proceso cierre el intento.
    await applyStatusEvent(getAdminDb(), jobDoc(quoteId), { wamid: "wamid.ADELANTE", status: "sent", timestampSeconds: nowSec() });
    expect((await getJob(quoteId)).status).toBe("sent");
    const status = await finalizeAttempt(getAdminDb(), jobDoc(quoteId), claim, { ok: true, messageId: "wamid.ADELANTE", retryable: false });
    expect(status).toBe("sent"); // no retrocede a "accepted"
    const job = await getJob(quoteId);
    expect(job.providerMessageId).toBe("wamid.ADELANTE");
  });

  it("no se registra ningún teléfono en los eventos guardados", async () => {
    responder = metaOk("wamid.PRIV");
    const { quoteId } = await newQuote();
    const body = statusBody([{ id: "wamid.PRIV", status: "delivered", ts: nowSec(), cb: `wa1|${ADMIN_UID}|${quoteId}|1` }]);
    await callWebhook(body, signMeta(body));
    const events = await jobDoc(quoteId).collection("events").get();
    expect(JSON.stringify(events.docs.map((d) => d.data()))).not.toContain("18095559999");
  });

  it("aviso de plantilla de NUESTRA WABA: se registra (nombre y estado); si es SINTÉTICO (cabecera x-sandbox-synthetic) el log lo etiqueta; jamás cambia un job", async () => {
    const { quoteId } = await newQuote();
    const before = await getJob(quoteId);
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: WABA_ID, changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "nueva_solicitud_cotizacion", reason: "NONE" } }] }],
    });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const real = await callWebhook(body, signMeta(body));
      const synthetic = await callWebhook(body, signMeta(body), { "x-sandbox-synthetic": "1" });
      const lines = spy.mock.calls.map((c) => String(c[0]));
      expect(real.json.templateUpdates).toBe(1);
      expect(synthetic.json.templateUpdates).toBe(1);
      expect(lines.filter((l) => l.includes("plantilla nueva_solicitud_cotizacion → APPROVED"))).toHaveLength(2);
      expect(lines.filter((l) => l.startsWith("[SINTÉTICO] ") && l.includes("plantilla nueva_solicitud_cotizacion"))).toHaveLength(1); // solo el marcado
      expect(lines.filter((l) => !l.startsWith("[SINTÉTICO] ") && l.includes("plantilla nueva_solicitud_cotizacion"))).toHaveLength(1);
    } finally { spy.mockRestore(); }
    const after = await getJob(quoteId);
    expect(after.status).toBe(before.status); // un aviso de plantilla no toca ningún aviso ni autoriza nada
    expect(after.attempts).toBe(before.attempts);
  });

  it("aviso de plantilla de OTRA WABA: no se registra", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "OTRA_WABA", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "ajena" } }] }],
    });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const r = await callWebhook(body, signMeta(body));
      expect(r.json.templateUpdates).toBe(0);
      expect(spy.mock.calls.map((c) => String(c[0])).some((l) => l.includes("plantilla ajena"))).toBe(false);
    } finally { spy.mockRestore(); }
  });
});

describe("Rutas y reglas", () => {
  it("el cliente autenticado del workspace puede LEER su job pero no escribirlo (reglas)", async () => {
    await signIn("admin-wa@integration.test");
    const { quoteId } = await newQuote();
    const { getDoc, doc, updateDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "whatsappNotifications", ADMIN_UID, "jobs", quoteId));
    expect(snap.exists()).toBe(true);
    await expect(updateDoc(doc(db, "whatsappNotifications", ADMIN_UID, "jobs", quoteId), { status: "delivered" })).rejects.toThrow();
    // Las colecciones internas nuevas no son legibles por el cliente.
    const dedup = await getDocs(collection(db, "catalogQuoteDedup", ADMIN_UID, "keys")).then(() => "leido", () => "denegado");
    expect(dedup).toBe("denegado");
    const events = await getDocs(collection(db, "whatsappNotifications", ADMIN_UID, "jobs", quoteId, "events")).then(() => "leido", () => "denegado");
    expect(events).toBe("denegado");
  });
});
