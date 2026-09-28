// Recorrido integrado del aviso automático por WhatsApp — código REAL de la
// app (rutas reales, lib real) contra Firestore+Auth emulados. Meta NUNCA se
// llama de verdad: global.fetch se mockea en cada test. Requiere los mismos
// emuladores que tests/integration/catalog-flow.integration.test.ts
// (`npm run test:integration`).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ensureCatalogSettings, updateCatalogSettings } from "@/lib/firestore/catalogSettings";
import { addInventoryItem, updateInventoryItem } from "@/lib/firestore/inventory";

const ADMIN_UID = "int-wa-admin";
const PASSWORD = "test-password-123!";
const APP_SECRET = "test-app-secret";

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_APP_SECRET = APP_SECRET;
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
process.env.WHATSAPP_TEMPLATE_NAME = "nueva_solicitud_catalogo";
process.env.WHATSAPP_TEMPLATE_LANG = "es";
process.env.APP_BASE_URL = "https://logianalytics-pro-v2.vercel.app";
process.env.CRON_SECRET = "test-cron-secret";

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

async function callWebhook(rawBody: string, signature: string) {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const req = new NextRequest("http://localhost/api/webhooks/whatsapp", {
    method: "POST", body: rawBody, headers: { "x-hub-signature-256": signature },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

async function callCron() {
  const { GET } = await import("@/app/api/cron/process-whatsapp-notifications/route");
  const req = new NextRequest("http://localhost/api/cron/process-whatsapp-notifications", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return { status: res.status, json: await res.json() };
}

async function getJob(quoteId: string) {
  const snap = await getDoc(doc(db, "whatsappNotifications", ADMIN_UID, "jobs", quoteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Referencia al fetch REAL antes de mockear nada — el Auth SDK (y partes del
// SDK de Firestore) hablan con el emulador vía fetch, así que el mock tiene
// que dejar pasar esas llamadas sin tocarlas y SOLO simular la respuesta de
// graph.facebook.com (que nunca se llama de verdad en estas pruebas). Cada
// test controla la respuesta simulada de Meta reasignando `nextMetaResponse`
// en vez de reinstalar el mock entero.
//
// El stub de `fetch` se instala UNA sola vez acá (top-level beforeAll) y
// nunca se desinstala durante la corrida — instalarlo/desinstalarlo en cada
// beforeEach/afterEach es tentador pero Vitest ejecuta TODOS los beforeAll
// (de afuera hacia adentro) antes que el primer beforeEach de nivel raíz
// para el primer test de cada describe anidado; si el stub se instala recién
// en beforeEach, cualquier beforeAll de un describe (como los que arman datos
// con callSolicitudRoute) se ejecuta contra el fetch REAL, sin mockear nada.
const realFetch = globalThis.fetch;
let nextMetaResponse: () => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }> =
  async () => ({ ok: true, json: async () => ({ messages: [{ id: "wamid.TEST" }] }) });

function mockMetaResponse(fn: typeof nextMetaResponse) {
  nextMetaResponse = fn;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("127.0.0.1")) return realFetch(input, init);
    return nextMetaResponse() as unknown as Response;
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
    whatsappNumber: "+18095559999", // receptor — Stefany, distinto del emisor (env vars)
    whatsappNotificationsConsent: true,
    pickup: { enabled: true, address: "Calle Test 1" },
  });
});

afterAll(async () => {
  await getAdminAuth().deleteUser(ADMIN_UID).catch(() => {});
  vi.unstubAllGlobals();
});

beforeEach(() => {
  nextMetaResponse = async () => ({ ok: true, json: async () => ({ messages: [{ id: "wamid.TEST" }] }) });
});

describe("Job de aviso: creación atómica junto con la solicitud", () => {
  let productId: string;
  let slug: string;

  beforeAll(async () => {
    const added = await addInventoryItem(ADMIN_UID, {
      name: "Producto WA", category: "Test", color: "", supplier: "",
      currentStock: 20, minStock: 1, maxStock: 100, unitCost: 50, salePrice: 100, leadTimeDays: 3,
    });
    productId = added.id!;
    await updateInventoryItem(ADMIN_UID, productId, {
      catalog: { published: true, variants: [{ id: "vA", label: "Color: Rojo" }, { id: "vB", label: "Color: Azul" }] },
    });
    const { getCatalogSettings } = await import("@/lib/firestore/catalogSettings");
    slug = (await getCatalogSettings(ADMIN_UID))!.publicSlug;
  });

  it("crea la cotización Y el job en el mismo envío, y el envío inline queda 'sent' con el fetch mockeado en éxito", async () => {
    // Nota: como global.fetch está completamente reemplazado en este test
    // (no delega al real), usamos un mock simple que solo responde éxito.
    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.INLINE1" }] }),
    }));

    const { json } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, variantId: "vA", quantity: 2 }],
      customerName: "Cliente WA 1", customerPhone: "+18095551001", deliveryMethod: "retiro",
    });
    expect(json.ok).toBe(true);

    // Encontrar la cotización recién creada para conocer su id.
    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const quote = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!;

    const job = await getJob(quote.id);
    expect(job).toBeTruthy();
    expect((job as any).status).toBe("sent");
    expect((job as any).providerMessageId).toBe("wamid.INLINE1");
    expect((job as any).recipientPhone).toBe("+18095559999"); // el RECEPTOR configurado, nunca el del cliente
  });

  it("dos solicitudes con VARIANTES distintas del mismo producto NO se confunden como duplicado (antes sí)", async () => {
    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.VARIANTE" }] }),
    }));
    const first = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, variantId: "vA", quantity: 1 }],
      customerName: "Cliente Variante", customerPhone: "+18095551002", deliveryMethod: "retiro",
    });
    const second = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, variantId: "vB", quantity: 1 }], // MISMA cantidad, VARIANTE distinta
      customerName: "Cliente Variante", customerPhone: "+18095551002", deliveryMethod: "retiro",
    });
    expect(first.json.publicRef).not.toBe(second.json.publicRef); // dos cotizaciones reales, no una "deduplicada" de más
  });

  it("la MISMA solicitud repetida (doble click) sí se deduplica y no crea un segundo job", async () => {
    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.DUP" }] }),
    }));
    const body = {
      items: [{ inventoryId: productId, variantId: "vA", quantity: 1 }],
      customerName: "Cliente Doble", customerPhone: "+18095551003", deliveryMethod: "retiro" as const,
    };
    const first = await callSolicitudRoute(slug, body);
    const second = await callSolicitudRoute(slug, body);
    expect(first.json.publicRef).toBe(second.json.publicRef);

    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const matching = quotesSnap.docs.filter((d) => d.data().publicRef === first.json.publicRef);
    expect(matching.length).toBe(1); // una sola cotización pese a las dos peticiones
  });
});

describe("attemptSendJob: clasificación de error y backoff (vía la ruta pública, fetch mockeado en falla)", () => {
  let productId: string;
  let slug: string;

  beforeAll(async () => {
    const added = await addInventoryItem(ADMIN_UID, {
      name: "Producto WA Falla", category: "Test", color: "", supplier: "",
      currentStock: 20, minStock: 1, maxStock: 100, unitCost: 50, salePrice: 100, leadTimeDays: 3,
    });
    productId = added.id!;
    await updateInventoryItem(ADMIN_UID, productId, { catalog: { published: true } });
    const { getCatalogSettings } = await import("@/lib/firestore/catalogSettings");
    slug = (await getCatalogSettings(ADMIN_UID))!.publicSlug;
  });

  it("error reintentable (5xx) deja el job en 'pending' con nextAttemptAt en el futuro — la solicitud igual se guarda", async () => {
    mockMetaResponse(async () => ({
      ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }),
    }));
    const { json, status } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, quantity: 1 }],
      customerName: "Cliente Falla 500", customerPhone: "+18095551004", deliveryMethod: "retiro",
    });
    expect(status).toBe(200); // la solicitud se guarda igual aunque WhatsApp falle
    expect(json.ok).toBe(true);

    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const quote = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!;
    const job = await getJob(quote.id) as any;
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt.toMillis()).toBeGreaterThan(Date.now());
    expect(job.lastErrorSafe).toBeTruthy();
  });

  it("error PERMANENTE (plantilla inválida) marca el job 'failed' de inmediato, sin agotar reintentos", async () => {
    mockMetaResponse(async () => ({
      ok: false, status: 400, json: async () => ({ error: { message: "Template not found", code: 132000 } }),
    }));
    const { json } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, quantity: 1 }],
      customerName: "Cliente Falla Permanente", customerPhone: "+18095551005", deliveryMethod: "retiro",
    });
    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const quote = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!;
    const job = await getJob(quote.id) as any;
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
  });

  it("\"Reintentar aviso\" (ruta autenticada) reabre un job 'failed' y, si Meta responde bien esta vez, queda 'sent'", async () => {
    mockMetaResponse(async () => ({
      ok: false, status: 400, json: async () => ({ error: { message: "Template not found", code: 132000 } }),
    }));
    const { json } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: productId, quantity: 1 }],
      customerName: "Cliente Reintento", customerPhone: "+18095551006", deliveryMethod: "retiro",
    });
    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const quote = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!;
    expect((await getJob(quote.id) as any).status).toBe("failed");

    // Ahora Meta "se arregla" y el reintento manual sale bien.
    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.RETRY_OK" }] }),
    }));
    const user = await signIn("admin-wa@integration.test");
    const token = await user.getIdToken();
    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const req = new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId: quote.id }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect((await getJob(quote.id) as any).status).toBe("sent");
  });

  it("otra empresa NO puede reintentar el job de esta empresa (aislamiento en la ruta de reintento)", async () => {
    // OJO: se obtiene el quoteId con el SDK de Admin (bypassa reglas) ANTES
    // de cambiar la sesión del cliente a la otra empresa — si se leyera con
    // el cliente ya logueado como adminB, fallaría por aislamiento (correcto,
    // pero no es lo que este test quiere comprobar).
    const quotesSnap = await getAdminDb().collection("catalogQuotes").doc(ADMIN_UID).collection("records").limit(1).get();
    const anyQuoteId = quotesSnap.docs[0].id;

    await seedUser("int-wa-admin-b", "admin-wa-b@integration.test", {
      role: "admin", workspaceId: "int-wa-admin-b", enabledModules: ["catalogo"], fullName: "Admin WA B",
    });
    const otherUser = await signIn("admin-wa-b@integration.test");
    const token = await otherUser.getIdToken();

    const { POST } = await import("@/app/api/catalogo/notifications/retry/route");
    const req = new NextRequest("http://localhost/api/catalogo/notifications/retry", {
      method: "POST", body: JSON.stringify({ quoteId: anyQuoteId }),
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(404); // no encuentra la cotización EN SU PROPIO workspace — no filtra si existe en otro
    await getAdminAuth().deleteUser("int-wa-admin-b").catch(() => {});

    // Vuelve a dejar la sesión del cliente como adminA — los describe()
    // siguientes de este archivo asumen esa sesión activa.
    await signIn("admin-wa@integration.test");
  });
});

describe("Cron de reintentos: levanta jobs 'pending' cuyo backoff ya venció", () => {
  beforeAll(async () => { await signIn("admin-wa@integration.test"); }); // defensivo: por si un describe anterior dejó la sesión del cliente en otra empresa

  it("procesa un job pending con nextAttemptAt en el pasado y lo deja 'sent' si Meta responde bien", async () => {
    const added = await addInventoryItem(ADMIN_UID, {
      name: "Producto Cron", category: "Test", color: "", supplier: "",
      currentStock: 5, minStock: 1, maxStock: 100, unitCost: 50, salePrice: 100, leadTimeDays: 3,
    });
    await updateInventoryItem(ADMIN_UID, added.id!, { catalog: { published: true } });
    const { getCatalogSettings } = await import("@/lib/firestore/catalogSettings");
    const slug = (await getCatalogSettings(ADMIN_UID))!.publicSlug;

    // Primero falla (queda pending con backoff en el futuro)...
    mockMetaResponse(async () => ({
      ok: false, status: 500, json: async () => ({ error: { message: "Internal error", code: 1 } }),
    }));
    const { json } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: added.id, quantity: 1 }],
      customerName: "Cliente Cron", customerPhone: "+18095551007", deliveryMethod: "retiro",
    });
    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    const quote = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!;

    // ...forzamos que el backoff ya haya vencido (vía Admin SDK, simulando que pasó el tiempo).
    await getAdminDb().collection("whatsappNotifications").doc(ADMIN_UID).collection("jobs").doc(quote.id)
      .update({ nextAttemptAt: new Date(Date.now() - 1000) });

    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.CRON_OK" }] }),
    }));
    const { json: cronResult } = await callCron();
    expect(cronResult.processed).toBeGreaterThanOrEqual(1);
    expect((await getJob(quote.id) as any).status).toBe("sent");
  });

  it("rechaza sin el CRON_SECRET correcto", async () => {
    const { GET } = await import("@/app/api/cron/process-whatsapp-notifications/route");
    const req = new NextRequest("http://localhost/api/cron/process-whatsapp-notifications", {
      headers: { authorization: "Bearer incorrecto" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("Webhook de Meta: firma, idempotencia y desorden", () => {
  let quoteId: string;

  beforeAll(async () => {
    await signIn("admin-wa@integration.test"); // defensivo, ver nota en el describe anterior
    const added = await addInventoryItem(ADMIN_UID, {
      name: "Producto Webhook", category: "Test", color: "", supplier: "",
      currentStock: 5, minStock: 1, maxStock: 100, unitCost: 50, salePrice: 100, leadTimeDays: 3,
    });
    await updateInventoryItem(ADMIN_UID, added.id!, { catalog: { published: true } });
    const { getCatalogSettings } = await import("@/lib/firestore/catalogSettings");
    const slug = (await getCatalogSettings(ADMIN_UID))!.publicSlug;

    mockMetaResponse(async () => ({
      ok: true, json: async () => ({ messages: [{ id: "wamid.WEBHOOKTEST" }] }),
    }));
    const { json } = await callSolicitudRoute(slug, {
      items: [{ inventoryId: added.id, quantity: 1 }],
      customerName: "Cliente Webhook", customerPhone: "+18095551008", deliveryMethod: "retiro",
    });
    const quotesSnap = await getDocs(collection(db, "catalogQuotes", ADMIN_UID, "records"));
    quoteId = quotesSnap.docs.find((d) => d.data().publicRef === json.publicRef)!.id;
  });

  function statusPayload(status: string, timestampSeconds: number) {
    return JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.WEBHOOKTEST", status, timestamp: String(timestampSeconds) }] } }] }],
    });
  }

  it("rechaza una firma inválida sin tocar el job", async () => {
    const body = statusPayload("delivered", Math.floor(Date.now() / 1000));
    const { status } = await callWebhook(body, "sha256=firma-falsa");
    expect(status).toBe(401);
    expect((await getJob(quoteId) as any).status).toBe("sent"); // sigue como estaba
  });

  it("con firma válida, aplica 'delivered'", async () => {
    const body = statusPayload("delivered", Math.floor(Date.now() / 1000));
    const { status, json } = await callWebhook(body, signMeta(body));
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect((await getJob(quoteId) as any).status).toBe("delivered");
  });

  it("reenvío del MISMO evento (Meta reintenta webhooks) es idempotente — no rompe nada", async () => {
    const body = statusPayload("delivered", Math.floor(Date.now() / 1000) - 5);
    const { status } = await callWebhook(body, signMeta(body));
    expect(status).toBe(200);
    expect((await getJob(quoteId) as any).status).toBe("delivered"); // sin cambios
  });

  it("un evento 'sent' que llega DESPUÉS pero es más viejo (fuera de orden) no retrocede el estado", async () => {
    const body = statusPayload("sent", Math.floor(Date.now() / 1000) - 3600);
    const { status } = await callWebhook(body, signMeta(body));
    expect(status).toBe(200);
    expect((await getJob(quoteId) as any).status).toBe("delivered"); // sigue "delivered", no bajó a "sent"
  });
});
