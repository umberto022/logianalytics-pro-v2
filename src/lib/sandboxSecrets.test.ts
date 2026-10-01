import { describe, it, expect } from "vitest";
import {
  appSecretLooksValid, accessTokenLooksValid, cleanPastedSecret, secretState,
} from "../../scripts/whatsapp-sandbox/env.mjs";

const TOKEN = "EAAT" + "aB3-_xY9".repeat(30); // 4 + 240 caracteres, forma de token de Meta (inventado)
const SECRET = "0123456789abcdef0123456789ABCDEF"; // 32 hex (inventado)

describe("validación de credenciales de Meta (evita confundir token de acceso y App Secret)", () => {
  it("un App Secret son exactamente 32 hexadecimales; un token empieza por EAA", () => {
    expect(appSecretLooksValid(SECRET)).toBe(true);
    expect(appSecretLooksValid(TOKEN)).toBe(false); // el error real: un token pegado donde iba el App Secret
    expect(appSecretLooksValid(SECRET + "0")).toBe(false);
    expect(appSecretLooksValid("g".repeat(32))).toBe(false);
    expect(accessTokenLooksValid(TOKEN)).toBe(true);
    expect(accessTokenLooksValid(SECRET)).toBe(false);
  });

  it("secretState avisa del formato inválido sin revelar el valor", () => {
    expect(secretState(TOKEN, "secret")).toContain("FORMATO INVÁLIDO");
    expect(secretState(SECRET, "token")).toContain("FORMATO INVÁLIDO");
    expect(secretState(SECRET, "secret")).toBe("cargado");
    expect(secretState(TOKEN, "token")).toBe("cargado");
    expect(secretState("", "token")).toBe("vacío");
    for (const st of [secretState(TOKEN, "secret"), secretState(SECRET, "token")]) {
      expect(st).not.toContain(TOKEN.slice(4, 20));
      expect(st).not.toContain(SECRET.slice(0, 10));
    }
  });
});

describe("cleanPastedSecret — pegados dobles o con caracteres de control", () => {
  it("un valor limpio queda igual", () => {
    expect(cleanPastedSecret(TOKEN)).toBe(TOKEN);
    expect(cleanPastedSecret(SECRET)).toBe(SECRET);
  });
  it("pegado 2 o 3 veces seguidas (el caso real: 3 × el mismo token) → un solo bloque", () => {
    expect(cleanPastedSecret(TOKEN.repeat(3))).toBe(TOKEN);
    expect(cleanPastedSecret(SECRET.repeat(2))).toBe(SECRET);
  });
  it("quita secuencias de pegado con corchetes, espacios y saltos de línea", () => {
    const ESC = String.fromCharCode(27);
    expect(cleanPastedSecret(`${ESC}[200~ ${SECRET} ${ESC}[201~\r\n`)).toBe(SECRET);
    expect(cleanPastedSecret(`  ${TOKEN}\t\n`)).toBe(TOKEN);
  });
  it("NO adivina: un valor sin forma reconocible se devuelve tal cual (la validación de formato lo rechaza)", () => {
    const mixed = TOKEN + SECRET; // token + otro valor distinto: no es repetición
    expect(cleanPastedSecret(mixed)).toBe(mixed);
    expect(appSecretLooksValid(cleanPastedSecret(mixed))).toBe(false);
  });
});
