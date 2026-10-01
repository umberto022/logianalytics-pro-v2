import { describe, it, expect } from "vitest";
import { safeNextPath, loginUrlWithNext } from "./safeRedirect";

describe("safeNextPath — solo rutas internas", () => {
  it("acepta rutas internas con query (el enlace del aviso de WhatsApp)", () => {
    expect(safeNextPath("/solicitudes?ref=abc123")).toBe("/solicitudes?ref=abc123");
    expect(safeNextPath("/inventario")).toBe("/inventario");
  });

  it("rechaza cualquier intento de salir del origen (open redirect)", () => {
    for (const evil of [
      "//evil.example", "https://evil.example", "http://evil.example/x", "javascript:alert(1)", "/\\evil.example",
      "\\\\evil.example", "/%09/evil.example".replace("%09", "\t"), "///evil.example", "evil.example", "data:text/html,x",
    ]) expect(safeNextPath(evil), evil).toBeNull();
  });

  it("rechaza vacío, demasiado largo y el propio login (bucle)", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("/x?" + "a".repeat(600))).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/solicitudes")).toBeNull();
  });
});

describe("loginUrlWithNext", () => {
  it("recuerda la ruta y su query", () => {
    expect(loginUrlWithNext("/solicitudes", "?ref=abc123")).toBe("/login?next=%2Fsolicitudes%3Fref%3Dabc123");
  });
  it("sin destino útil, /login a secas", () => {
    expect(loginUrlWithNext("/", "")).toBe("/login");
    expect(loginUrlWithNext("/dashboard", "")).toBe("/login");
  });
  it("ida y vuelta: lo que se codifica se recupera igual", () => {
    const u = new URL(loginUrlWithNext("/solicitudes", "?ref=abc123"), "http://x");
    expect(safeNextPath(u.searchParams.get("next"))).toBe("/solicitudes?ref=abc123");
  });
});
