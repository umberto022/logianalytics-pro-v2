// Verifica /api/workspace-status exponiendo la identidad visual de la empresa
// (tradeName/logoUrl) a TODO el workspace, y que una empresa nunca ve la marca
// de otra — usando el código real de la ruta contra los emuladores de
// Firestore + Auth (no mocks de Firestore).
//
// Requiere `firebase emulators:start --only firestore,auth --project
// demo-logianalytics-test` corriendo en 127.0.0.1:8080/9099.
// Ejecutar con `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_UID = "int-brand-admin";
const EMPLOYEE_UID = "int-brand-employee";
const OTHER_ADMIN_UID = "int-brand-other-admin";
const NO_COMPANY_UID = "int-brand-no-company";
const COMPANY_ID = "int-brand-company";
const PASSWORD = "test-password-123!";

async function seedUser(uid: string, email: string, data: Record<string, unknown>) {
  await getAdminAuth().createUser({ uid, email, password: PASSWORD }).catch(() => {});
  await getAdminDb().collection("users").doc(uid).set({ email, createdAt: new Date(), ...data });
}

async function signIn(email: string) {
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  return cred.user;
}

async function callWorkspaceStatus(idToken: string) {
  const { GET } = await import("@/app/api/workspace-status/route");
  const req = new NextRequest("http://localhost/api/workspace-status", {
    headers: { authorization: `Bearer ${idToken}` },
  });
  const res = await GET(req);
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  await getAdminDb().collection("companies").doc(COMPANY_ID).set({
    ownerId: ADMIN_UID,
    name: "Razón Social de Integración SRL",
    tradeName: "Marca de Integración",
    logoUrl: "https://res.cloudinary.com/demo/image/upload/int-logo.png",
    rif: "1-00-00000-1",
    industry: "Otro",
    country: "República Dominicana",
    address: "", phone: "", email: "",
    createdAt: new Date(),
  });

  await seedUser(ADMIN_UID, "brand-admin@integration.test", {
    role: "admin", workspaceId: ADMIN_UID, companyId: COMPANY_ID, fullName: "Admin Marca",
  });
  await seedUser(EMPLOYEE_UID, "brand-employee@integration.test", {
    role: "ventas", workspaceId: ADMIN_UID, fullName: "Empleada",
  });
  await seedUser(OTHER_ADMIN_UID, "brand-other-admin@integration.test", {
    role: "admin", workspaceId: OTHER_ADMIN_UID, fullName: "Otro Admin",
    // Sin companyId — nunca configuró una empresa propia.
  });
  await seedUser(NO_COMPANY_UID, "brand-no-company@integration.test", {
    role: "admin", workspaceId: NO_COMPANY_UID, fullName: "Admin Sin Empresa",
  });
});

afterAll(async () => {
  await getAdminDb().collection("companies").doc(COMPANY_ID).delete().catch(() => {});
  for (const uid of [ADMIN_UID, EMPLOYEE_UID, OTHER_ADMIN_UID, NO_COMPANY_UID]) {
    await getAdminDb().collection("users").doc(uid).delete().catch(() => {});
    await getAdminAuth().deleteUser(uid).catch(() => {});
  }
});

describe("/api/workspace-status — identidad visual de empresa", () => {
  it("el admin dueño de la empresa recibe su tradeName y logoUrl", async () => {
    const user = await signIn("brand-admin@integration.test");
    const token = await user.getIdToken();
    const { status, json } = await callWorkspaceStatus(token);
    expect(status).toBe(200);
    expect(json.companyTradeName).toBe("Marca de Integración");
    expect(json.companyLogoUrl).toBe("https://res.cloudinary.com/demo/image/upload/int-logo.png");
  });

  it("una empleada del MISMO workspace (no admin) también recibe la marca — es para todo el equipo", async () => {
    const user = await signIn("brand-employee@integration.test");
    const token = await user.getIdToken();
    const { json } = await callWorkspaceStatus(token);
    expect(json.companyTradeName).toBe("Marca de Integración");
    expect(json.companyLogoUrl).toBe("https://res.cloudinary.com/demo/image/upload/int-logo.png");
  });

  it("aislamiento: un admin de OTRO workspace nunca ve la marca de esta empresa", async () => {
    const user = await signIn("brand-other-admin@integration.test");
    const token = await user.getIdToken();
    const { json } = await callWorkspaceStatus(token);
    expect(json.companyTradeName).toBeNull();
    expect(json.companyLogoUrl).toBeNull();
  });

  it("workspace sin companyId (nunca registró una empresa): null, no revienta", async () => {
    const user = await signIn("brand-no-company@integration.test");
    const token = await user.getIdToken();
    const { status, json } = await callWorkspaceStatus(token);
    expect(status).toBe(200);
    expect(json.companyTradeName).toBeNull();
    expect(json.companyLogoUrl).toBeNull();
  });

  it("sin token: 403", async () => {
    const { GET } = await import("@/app/api/workspace-status/route");
    const req = new NextRequest("http://localhost/api/workspace-status");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
