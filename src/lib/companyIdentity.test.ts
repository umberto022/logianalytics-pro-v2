import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Company, UserProfile } from "@/types";

const { getCompanyMock } = vi.hoisted(() => ({ getCompanyMock: vi.fn() }));
vi.mock("@/lib/firestore/companies", () => ({ getCompany: getCompanyMock }));

import { resolveInvoiceCompanyInfo } from "./companyIdentity";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1", email: "a@b.com", fullName: "Test", phone: "",
    role: "admin", workspaceId: "ws1",
    ...overrides,
  } as UserProfile;
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1", ownerId: "u1", name: "Razón Social SRL", rif: "1-23-45678-9",
    industry: "Otro", country: "República Dominicana", address: "", phone: "", email: "",
    createdAt: null as unknown as Company["createdAt"],
    ...overrides,
  } as Company;
}

describe("resolveInvoiceCompanyInfo", () => {
  beforeEach(() => {
    getCompanyMock.mockReset();
  });

  it("usa tradeName cuando la empresa lo tiene configurado", async () => {
    getCompanyMock.mockResolvedValue(company({ tradeName: "Stefany's Creations", logoUrl: "https://x/logo.png" }));
    const r = await resolveInvoiceCompanyInfo(profile({ companyId: "c1", companyName: "Perfil SRL" }));
    expect(r.companyName).toBe("Stefany's Creations");
    expect(r.companyLogoUrl).toBe("https://x/logo.png");
    expect(r.companyRif).toBe("1-23-45678-9");
  });

  it("cae a la razón social fiscal (Company.name) si no hay tradeName", async () => {
    getCompanyMock.mockResolvedValue(company({ tradeName: undefined }));
    const r = await resolveInvoiceCompanyInfo(profile({ companyId: "c1", companyName: "Perfil SRL" }));
    expect(r.companyName).toBe("Razón Social SRL");
  });

  it("cae a profile.companyName si el doc Company no existe (caso común: nunca se registró)", async () => {
    getCompanyMock.mockResolvedValue(null);
    const r = await resolveInvoiceCompanyInfo(profile({ companyId: "c1", companyName: "Perfil SRL" }));
    expect(r.companyName).toBe("Perfil SRL");
    expect(r.companyRif).toBeUndefined();
  });

  it("cae a profile.companyName si getCompany falla, y loguea el error (no lo traga en silencio)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getCompanyMock.mockRejectedValue(new Error("permission-denied"));
    const r = await resolveInvoiceCompanyInfo(profile({ companyId: "c1", companyName: "Perfil SRL" }));
    expect(r.companyName).toBe("Perfil SRL");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sin companyId y sin companyName: no hay nombre que mostrar (InvoiceModal aplica su propio último recurso)", async () => {
    const r = await resolveInvoiceCompanyInfo(profile({ companyId: undefined, companyName: undefined }));
    expect(r.companyName).toBeUndefined();
    expect(getCompanyMock).not.toHaveBeenCalled();
  });

  it("perfil null/undefined no revienta", async () => {
    const r = await resolveInvoiceCompanyInfo(null);
    expect(r.companyName).toBeUndefined();
  });
});
