// Pruebas de firestore.rules contra el emulador de Firestore (127.0.0.1:8080).
// Requiere: `firebase emulators:start --only firestore --project demo-logianalytics-test`
// corriendo en paralelo. Ejecutar con `npm run test:rules`.
//
// Objetivo: verificar EMPÍRICAMENTE (no solo por lectura del código) que:
// 1. Un empleado de la misma empresa (ventasA) hereda el acceso al catálogo
//    vía el enabledModules del ADMIN dueño del workspace, no del suyo propio.
// 2. Nadie puede auto-activar el módulo escribiendo enabledModules desde el cliente.
// 3. Las colecciones del catálogo son invisibles para un visitante anónimo
//    (confirma que el catálogo público SOLO puede servirse vía Admin SDK).
// 4. Una empresa (adminB) no puede leer ni escribir nada de otra (adminA).
// 5. Qué rol puede realmente escribir en `inventory` y `sales` — esto
//    determina si convertQuoteToSale funciona para el rol "ventas" o si debe
//    restringirse a admin.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, Timestamp } from "firebase/firestore";

const PROJECT_ID = "demo-logianalytics-test";
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();

    // Workspace A: adminA (dueña, catálogo habilitado) + empleados
    await setDoc(doc(db, "users", "adminA"), {
      email: "admin-a@test.com", role: "admin", workspaceId: "adminA",
      enabledModules: ["catalogo"], createdAt: now,
    });
    await setDoc(doc(db, "users", "ventasA"), {
      email: "ventas-a@test.com", role: "ventas", workspaceId: "adminA", createdAt: now,
    });
    await setDoc(doc(db, "users", "logisticaA"), {
      email: "logistica-a@test.com", role: "logistica", workspaceId: "adminA", createdAt: now,
    });

    // Workspace B: otra empresa distinta, también con catálogo habilitado
    await setDoc(doc(db, "users", "adminB"), {
      email: "admin-b@test.com", role: "admin", workspaceId: "adminB",
      enabledModules: ["catalogo"], createdAt: now,
    });

    await setDoc(doc(db, "catalogSettings", "adminA"), {
      businessName: "Empresa A", enabled: true, publicSlug: "empresa-a",
      colors: { primary: "#000", accent: "#111" },
      pickup: { enabled: true }, delivery: { enabled: true, zones: [] },
      discountRule: { minQty: 4, pct: 20, appliesToShipping: false },
      advanceRule: { pct: 50, largeOrderThresholdCents: 200000, thresholdAfterDiscountExcludingShipping: true },
      leadTimeNote: "x", createdAt: now, updatedAt: now,
    });

    await setDoc(doc(db, "catalogQuotes", "adminA", "records", "q1"), {
      publicRef: "A-000001", status: "recibida", items: [], subtotalCents: 0,
      discountCents: 0, discountPct: 0, productsTotalCents: 0,
      deliveryMethod: "retiro", customerName: "Cliente Test", customerPhone: "+18095550000",
      customerType: "nuevo", requiresAdvance: false, leadTimeNote: "x",
      revision: 1, history: [], createdAt: now, updatedAt: now,
    });

    await setDoc(doc(db, "inventory", "adminA", "items", "item1"), {
      sku: "SKU-1", name: "Producto 1", category: "Cat", color: "", supplier: "",
      currentStock: 10, minStock: 1, maxStock: 100, unitCost: 100, salePrice: 200,
      leadTimeDays: 7, updatedAt: now,
    });
  });
});

describe("Acceso interno al catálogo (mismo workspace)", () => {
  it("un empleado 'ventas' del workspace A puede LEER la config del catálogo (hereda enabledModules del admin dueño)", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertSucceeds(getDoc(doc(db, "catalogSettings", "adminA")));
  });

  it("un empleado 'ventas' del workspace A puede LEER una solicitud de ese workspace", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertSucceeds(getDoc(doc(db, "catalogQuotes", "adminA", "records", "q1")));
  });

  it("'logistica' (rol sin acceso a catalogo en MODULE_ACCESS) NO puede leer la bandeja de solicitudes", async () => {
    const db = testEnv.authenticatedContext("logisticaA").firestore();
    await assertFails(getDoc(doc(db, "catalogQuotes", "adminA", "records", "q1")));
  });

  it("un empleado 'ventas' NO puede crear una solicitud desde el cliente (solo Admin SDK)", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertFails(addDoc(collection(db, "catalogQuotes", "adminA", "records"), {
      publicRef: "X", status: "recibida", items: [], createdAt: Timestamp.now(),
    }));
  });

  it("el propio admin dueño NO puede crear una solicitud desde el cliente tampoco", async () => {
    const db = testEnv.authenticatedContext("adminA").firestore();
    await assertFails(addDoc(collection(db, "catalogQuotes", "adminA", "records"), {
      publicRef: "X", status: "recibida", items: [], createdAt: Timestamp.now(),
    }));
  });
});

describe("Nadie puede auto-activar el módulo", () => {
  it("el propio admin NO puede agregarse 'catalogo' a enabledModules vía el cliente", async () => {
    const db = testEnv.authenticatedContext("adminA").firestore();
    await assertFails(updateDoc(doc(db, "users", "adminA"), { enabledModules: ["catalogo", "otraCosa"] }));
  });

  it("un empleado NO puede escribir enabledModules en el doc del admin", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertFails(updateDoc(doc(db, "users", "adminA"), { enabledModules: ["catalogo"] }));
  });
});

describe("El catálogo público NO es legible/escribible directo por el cliente (debe pasar por Admin SDK)", () => {
  it("un visitante anónimo NO puede leer catalogSettings", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "catalogSettings", "adminA")));
  });

  it("un visitante anónimo NO puede leer una solicitud por su id", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "catalogQuotes", "adminA", "records", "q1")));
  });

  it("un visitante anónimo NO puede crear una solicitud", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, "catalogQuotes", "adminA", "records"), {
      publicRef: "X", status: "recibida", items: [], createdAt: Timestamp.now(),
    }));
  });

  it("un visitante anónimo NO puede leer el inventario (para armar el catálogo 'a mano')", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "inventory", "adminA", "items", "item1")));
  });
});

describe("Aislamiento entre empresas", () => {
  it("el admin de la empresa B NO puede leer la config de catálogo de la empresa A", async () => {
    const db = testEnv.authenticatedContext("adminB").firestore();
    await assertFails(getDoc(doc(db, "catalogSettings", "adminA")));
  });

  it("el admin de la empresa B NO puede leer una solicitud de la empresa A", async () => {
    const db = testEnv.authenticatedContext("adminB").firestore();
    await assertFails(getDoc(doc(db, "catalogQuotes", "adminA", "records", "q1")));
  });

  it("el admin de la empresa B NO puede modificar una solicitud de la empresa A (p. ej. inventar una aceptación)", async () => {
    const db = testEnv.authenticatedContext("adminB").firestore();
    await assertFails(updateDoc(doc(db, "catalogQuotes", "adminA", "records", "q1"), { status: "aceptada" }));
  });

  it("el admin de la empresa B NO puede leer el inventario de la empresa A", async () => {
    const db = testEnv.authenticatedContext("adminB").firestore();
    await assertFails(getDoc(doc(db, "inventory", "adminA", "items", "item1")));
  });
});

describe("Qué rol puede realmente descontar stock y registrar la venta (crítico para convertQuoteToSale)", () => {
  it("'ventas' puede CREAR un registro de venta", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertSucceeds(addDoc(collection(db, "sales", "adminA", "records"), {
      inventoryId: "item1", sku: "SKU-1", productName: "Producto 1", category: "Cat",
      quantity: 1, unitPrice: 200, unitCost: 100, route: "", zone: "", client: "Cliente Test",
      paymentStatus: "pagado", saleDate: Timestamp.now(), totalRevenue: 200, totalCost: 100, profit: 100,
    }));
  });

  it("'ventas' NO puede actualizar el stock de un producto de inventario (solo admin/logistica)", async () => {
    const db = testEnv.authenticatedContext("ventasA").firestore();
    await assertFails(updateDoc(doc(db, "inventory", "adminA", "items", "item1"), { currentStock: 9 }));
  });

  it("'admin' SÍ puede actualizar el stock", async () => {
    const db = testEnv.authenticatedContext("adminA").firestore();
    await assertSucceeds(updateDoc(doc(db, "inventory", "adminA", "items", "item1"), { currentStock: 9 }));
  });

  it("'logistica' SÍ puede actualizar el stock (pero no tiene acceso a catalogQuotes)", async () => {
    const db = testEnv.authenticatedContext("logisticaA").firestore();
    await assertSucceeds(updateDoc(doc(db, "inventory", "adminA", "items", "item1"), { currentStock: 9 }));
  });
});
