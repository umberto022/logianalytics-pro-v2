// Recorrido integrado end-to-end usando el CÓDIGO REAL de la app (no
// reimplementaciones) contra los emuladores de Firestore + Auth:
//   configurar → publicar → recibir solicitud (ruta pública real) →
//   preparar cotización → aceptar → registrar anticipo → confirmar →
//   convertir a venta → comprobar inventario y saldo.
//
// Requiere `firebase emulators:start --only firestore,auth --project
// demo-logianalytics-test` corriendo en 127.0.0.1:8080 (Firestore) y
// 127.0.0.1:9099 (Auth). Ejecutar con `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ensureCatalogSettings, updateCatalogSettings, getCatalogSettings } from "@/lib/firestore/catalogSettings";
import { updateInventoryItem, addInventoryItem, listInventory } from "@/lib/firestore/inventory";
import { updateSalePaymentStatus } from "@/lib/firestore/sales";
import {
  listQuotes, prepareQuote, markQuoteAccepted, registerQuoteAdvance, convertQuoteToSale,
} from "@/lib/firestore/catalogQuotes";
import { toCents } from "@/lib/money";
import type { Sale } from "@/types";

const ADMIN_A_UID = "int-admin-a";
const ADMIN_B_UID = "int-admin-b";
const PASSWORD = "test-password-123!";

async function seedUser(uid: string, email: string, data: Record<string, unknown>) {
  await getAdminAuth().createUser({ uid, email, password: PASSWORD }).catch(() => {
    // ya existe de una corrida anterior — seguimos, el doc de Firestore se pisa igual
  });
  await getAdminDb().collection("users").doc(uid).set({ email, createdAt: new Date(), ...data });
}

async function signIn(email: string) {
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  return cred.user;
}

async function callPublicRoute(method: "GET" | "POST", slug: string, body?: unknown) {
  const url = `http://localhost/api/catalogo/${slug}${body ? "/solicitud" : ""}`;
  const req = new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  if (method === "GET") {
    const { GET } = await import("@/app/api/catalogo/[slug]/route");
    const res = await GET(req, { params: { slug } });
    return { status: res.status, json: await res.json() };
  }
  const { POST } = await import("@/app/api/catalogo/[slug]/solicitud/route");
  const res = await POST(req, { params: { slug } });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  // Limpia cualquier resto de una corrida anterior contra el mismo emulador.
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-logianalytics-test/databases/(default)/documents`,
    { method: "DELETE" }
  ).catch(() => {});

  await seedUser(ADMIN_A_UID, "admin-a@integration.test", {
    role: "admin", workspaceId: ADMIN_A_UID, enabledModules: ["catalogo"], fullName: "Admin A",
  });
  await seedUser(ADMIN_B_UID, "admin-b@integration.test", {
    role: "admin", workspaceId: ADMIN_B_UID, enabledModules: ["catalogo"], fullName: "Admin B",
  });
});

afterAll(async () => {
  await getAdminAuth().deleteUser(ADMIN_A_UID).catch(() => {});
  await getAdminAuth().deleteUser(ADMIN_B_UID).catch(() => {});
});

describe("Recorrido integrado del catálogo (emulador real, código real)", () => {
  let slug: string;
  let productId: string;

  it("1. Configurar: crea la config inicial y la publica con WhatsApp/entrega", async () => {
    await signIn("admin-a@integration.test");
    const settings = await ensureCatalogSettings(ADMIN_A_UID, "Empresa Integración");
    expect(settings.enabled).toBe(false); // nunca queda público solo

    await updateCatalogSettings(ADMIN_A_UID, {
      enabled: true,
      whatsappNumber: "+18095550000",
      pickup: { enabled: true, address: "Calle Test 1" },
      delivery: { enabled: true, zones: ["Zona Test"] },
    });
    const updated = await getCatalogSettings(ADMIN_A_UID);
    expect(updated?.enabled).toBe(true);
    slug = updated!.publicSlug;
  });

  it("2. Publicar producto: agrega inventario y lo marca publicado con precio", async () => {
    const added = await addInventoryItem(ADMIN_A_UID, {
      name: "Producto Integración", category: "Test", color: "", supplier: "",
      currentStock: 5, minStock: 1, maxStock: 100, unitCost: 100, salePrice: 500,
      leadTimeDays: 3,
    });
    expect(added.ok).toBe(true);
    productId = added.id!;
    await updateInventoryItem(ADMIN_A_UID, productId, { catalog: { published: true } });
  });

  it("3. Recibir solicitud pública: la ruta REAL /api/catalogo/[slug]/solicitud recalcula precio y crea la cotización", async () => {
    const { status, json } = await callPublicRoute("POST", slug, {
      items: [{ inventoryId: productId, quantity: 4 }], // 4 uds → dispara el 20%
      customerName: "Cliente Integración",
      customerPhone: "+18095551111",
      deliveryMethod: "retiro",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.publicRef).toMatch(/^[A-Z]+-[A-Z0-9]{6}$/);
  });

  it("4. Bandeja: la solicitud aparece con el descuento ya calculado server-side", async () => {
    await signIn("admin-a@integration.test");
    const quotes = await listQuotes(ADMIN_A_UID);
    expect(quotes.length).toBe(1);
    const q = quotes[0];
    expect(q.status).toBe("recibida");
    expect(q.subtotalCents).toBe(toCents(2000)); // 4 x RD$500
    expect(q.discountCents).toBe(toCents(400));
    expect(q.productsTotalCents).toBe(toCents(1600));
    expect(q.customerType).toBe("nuevo"); // el visitante nunca lo eligió — lo resolvió el servidor
  });

  it("5. Preparar cotización (envío) → aceptar → registrar anticipo → queda confirmado", async () => {
    const quotes = await listQuotes(ADMIN_A_UID);
    const quoteId = quotes[0].id;

    const prep = await prepareQuote(ADMIN_A_UID, quoteId, {
      shippingCents: toCents(200),
      settings: (await getCatalogSettings(ADMIN_A_UID))!,
      by: "Admin A",
    });
    expect(prep.ok).toBe(true);

    let q = (await listQuotes(ADMIN_A_UID))[0];
    expect(q.totalCents).toBe(toCents(1800));       // 1600 + 200 envío
    expect(q.advanceAmountCents).toBe(toCents(800)); // 50% de 1600 (cliente nuevo)
    expect(q.balanceDueCents).toBe(toCents(1000));   // coincide con el ejemplo de la sección 6

    const accept = await markQuoteAccepted(ADMIN_A_UID, quoteId, "Admin A");
    expect(accept.ok).toBe(true);
    q = (await listQuotes(ADMIN_A_UID))[0];
    expect(q.status).toBe("pendiente_anticipo"); // requiresAdvance=true → no salta directo a "aceptada"

    const advance = await registerQuoteAdvance(ADMIN_A_UID, quoteId, {
      amountCents: toCents(800), method: "transferencia", by: "Admin A",
    });
    expect(advance.ok).toBe(true);
    q = (await listQuotes(ADMIN_A_UID))[0];
    expect(q.status).toBe("confirmado");
    expect(q.payments?.length).toBe(1); // el anticipo se registra UNA sola vez
  });

  it("6. Convertir a venta: descuenta stock una sola vez y dueña saldo correcto (crédito, no pendiente-invisible)", async () => {
    const quoteId = (await listQuotes(ADMIN_A_UID))[0].id;
    const before = (await listInventory(ADMIN_A_UID)).find((i) => i.id === productId)!;
    expect(before.currentStock).toBe(5);

    const converted = await convertQuoteToSale(ADMIN_A_UID, quoteId, { by: "Admin A" });
    expect(converted.ok).toBe(true);
    expect(converted.saleOrderId).toBeTruthy();

    const after = (await listInventory(ADMIN_A_UID)).find((i) => i.id === productId)!;
    expect(after.currentStock).toBe(1); // 5 - 4, UNA sola vez

    const salesSnap = await getDocs(query(collection(db, "sales", ADMIN_A_UID, "records"), where("quoteId", "==", quoteId)));
    expect(salesSnap.size).toBe(1); // una sola venta por la conversión
    const sale = salesSnap.docs[0].data() as Sale;
    expect(sale.totalRevenue).toBe(2000); // ingreso real de la venta: 4 x RD$500 (sin descontar el descuento del ingreso bruto)
    expect(sale.balanceDueCents).toBe(toCents(1000));
    expect(sale.advanceAmountCents).toBe(toCents(800));
    expect(sale.paymentStatus).toBe("credito"); // NO "pendiente" (invisible en Cuentas por Cobrar) ni "pagado" (falso)

    const q = (await listQuotes(ADMIN_A_UID))[0];
    expect(q.status).toBe("convertida");
    expect(q.saleOrderId).toBe(converted.saleOrderId);
  });

  it("7. Reintentar la conversión NO duplica la venta ni vuelve a descontar stock", async () => {
    const quoteId = (await listQuotes(ADMIN_A_UID))[0].id;
    const before = (await listInventory(ADMIN_A_UID)).find((i) => i.id === productId)!;

    const again = await convertQuoteToSale(ADMIN_A_UID, quoteId, { by: "Admin A" });
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/ya había sido convertida/);

    const after = (await listInventory(ADMIN_A_UID)).find((i) => i.id === productId)!;
    expect(after.currentStock).toBe(before.currentStock); // sin segundo descuento

    const salesSnap = await getDocs(query(collection(db, "sales", ADMIN_A_UID, "records"), where("quoteId", "==", quoteId)));
    expect(salesSnap.size).toBe(1); // sigue siendo una sola venta
  });

  it("7b. Cobrar el saldo restante con \"Marcar pagado\" (flujo habitual de Cuentas por Cobrar): saldo queda en cero, sin pago duplicado", async () => {
    const quoteId = (await listQuotes(ADMIN_A_UID))[0].id;
    const salesSnap = await getDocs(query(collection(db, "sales", ADMIN_A_UID, "records"), where("quoteId", "==", quoteId)));
    expect(salesSnap.size).toBe(1);
    const saleRef = salesSnap.docs[0];
    const saleBefore = saleRef.data() as Sale;
    expect(saleBefore.paymentStatus).toBe("credito");
    expect(saleBefore.balanceDueCents).toBe(toCents(1000));

    // Reconciliación: anticipo + saldo == total del pedido (productos con
    // descuento + envío) — nada de impuestos ni cargos de más se cuelan acá.
    expect((saleBefore.advanceAmountCents ?? 0) + (saleBefore.balanceDueCents ?? 0)).toBe(toCents(1800));

    const result = await updateSalePaymentStatus(ADMIN_A_UID, saleRef.id, "pagado");
    expect(result.ok).toBe(true);

    const salesAfter = await getDocs(query(collection(db, "sales", ADMIN_A_UID, "records"), where("quoteId", "==", quoteId)));
    expect(salesAfter.size).toBe(1); // "Marcar pagado" actualiza la venta existente, no crea una nueva
    const saleAfter = salesAfter.docs[0].data() as Sale;
    expect(saleAfter.paymentStatus).toBe("pagado"); // estado correcto: ni "pendiente" invisible ni sigue en "credito"
    expect(saleAfter.balanceDueCents).toBe(toCents(1000)); // snapshot histórico del saldo que HABÍA — paymentStatus "pagado" es lo que dice que ya no se debe nada
  });

  it("8. Solicitud mixta/sin stock: la conversión se bloquea entera, no vende parcial", async () => {
    // Segundo producto con stock insuficiente para la cantidad pedida.
    const added = await addInventoryItem(ADMIN_A_UID, {
      name: "Producto Sin Stock", category: "Test", color: "", supplier: "",
      currentStock: 1, minStock: 0, maxStock: 100, unitCost: 50, salePrice: 300,
      leadTimeDays: 3,
    });
    const shortItemId = added.id!;
    await updateInventoryItem(ADMIN_A_UID, shortItemId, { catalog: { published: true, allowBackorder: true } });

    const req = await callPublicRoute("POST", slug, {
      items: [{ inventoryId: shortItemId, quantity: 3 }], // pide 3, solo hay 1 → backorder
      customerName: "Cliente Mixto", customerPhone: "+18095552222", deliveryMethod: "retiro",
    });
    expect(req.status).toBe(200);

    const quotes = await listQuotes(ADMIN_A_UID);
    const mixedQuote = quotes.find((q) => q.customerName === "Cliente Mixto")!;
    expect(mixedQuote.items[0].isBackorder).toBe(true);

    const settings = (await getCatalogSettings(ADMIN_A_UID))!;
    await prepareQuote(ADMIN_A_UID, mixedQuote.id, { shippingCents: toCents(100), settings, by: "Admin A" });
    await markQuoteAccepted(ADMIN_A_UID, mixedQuote.id, "Admin A");
    // Cliente nuevo → requiere anticipo; lo registramos completo para llegar a "confirmado".
    const reloaded = (await listQuotes(ADMIN_A_UID)).find((q) => q.id === mixedQuote.id)!;
    if (reloaded.requiresAdvance) {
      await registerQuoteAdvance(ADMIN_A_UID, mixedQuote.id, { amountCents: reloaded.advanceAmountCents ?? 0, by: "Admin A" });
    }

    const beforeStock = (await listInventory(ADMIN_A_UID)).find((i) => i.id === shortItemId)!;
    const result = await convertQuoteToSale(ADMIN_A_UID, mixedQuote.id, { by: "Admin A" });

    expect(result.ok).toBe(false); // BLOQUEADA, no conversión parcial
    expect(result.message).toMatch(/stock/i);

    const afterStock = (await listInventory(ADMIN_A_UID)).find((i) => i.id === shortItemId)!;
    expect(afterStock.currentStock).toBe(beforeStock.currentStock); // nada se tocó

    const stillOpen = (await listQuotes(ADMIN_A_UID)).find((q) => q.id === mixedQuote.id)!;
    expect(stillOpen.status).toBe("confirmado"); // sigue abierta, no "convertida" a medias

    const salesSnap = await getDocs(query(collection(db, "sales", ADMIN_A_UID, "records"), where("quoteId", "==", mixedQuote.id)));
    expect(salesSnap.size).toBe(0); // ninguna venta parcial
  });

  it("9. Aislamiento: la empresa B no ve ni puede tocar las cotizaciones de la empresa A", async () => {
    await signIn("admin-a@integration.test");
    const someQuoteId = (await listQuotes(ADMIN_A_UID))[0].id;

    await signIn("admin-b@integration.test");
    await expect(getDoc(doc(db, "catalogQuotes", ADMIN_A_UID, "records", someQuoteId))).rejects.toThrow();
    await expect(listQuotes(ADMIN_A_UID)).rejects.toThrow();
  });
});
