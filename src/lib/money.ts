// Cálculos monetarios del catálogo en CENTAVOS (enteros) para evitar errores
// de decimales con floats. RD$ es la única moneda soportada en esta primera
// versión (ver CatalogSettings — no hay multi-moneda todavía).

export function toCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function fmtRD(cents: number): string {
  return `RD$${(cents / 100).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Redondeo bancario simple a centavo — evita que descuentos/porcentajes dejen residuos de punto flotante. */
export function pctOfCents(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}
