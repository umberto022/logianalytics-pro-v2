import type { Company, Sale, ECfType } from "@/types";
import type { AlanubeInvoicePayload, AlanubeItem } from "./alanube";

const ITBIS_RATE = 0.18; // tasa general de ITBIS en RD. Ver nota sobre exentos abajo.

/**
 * LogiAnalytics hoy no distingue precios con/sin ITBIS ni productos exentos —
 * `unitPrice` es simplemente lo cobrado. Para no inventar un monto de
 * impuesto que no cuadre con lo que el negocio realmente declara, asumimos
 * el precio como "ITBIS incluido" y lo extraemos matemáticamente. ESTO HAY
 * QUE CONFIRMARLO con el contador antes de emitir en producción — si algún
 * producto es exento (canasta básica, ciertos servicios) esta fórmula queda
 * mal para esas líneas.
 */
export function extractItbis(totalWithTax: number): number {
  return +(totalWithTax - totalWithTax / (1 + ITBIS_RATE)).toFixed(2);
}

export interface InvoiceDraftInput {
  company: Company;
  eNcf: string;
  eCfType: ECfType;
  sales: Sale[]; // todas las líneas de una misma venta (mismo saleOrderId, o una sola)
}

export interface InvoiceDraft {
  buyerRnc?: string;
  buyerName: string;
  totalAmount: number;
  itbis: number;
  currency: string;
}

export function buildInvoiceDraft({ sales }: InvoiceDraftInput): InvoiceDraft {
  const first = sales[0];
  const totalAmount = +sales.reduce((s, l) => s + l.totalRevenue, 0).toFixed(2);
  return {
    buyerRnc: first.clientRnc || undefined,
    buyerName: first.client || "Consumidor final",
    totalAmount,
    itbis: extractItbis(totalAmount),
    currency: "DOP",
  };
}

/** Arma el payload que espera la API de Alanube a partir de las líneas de una venta. */
export function buildAlanubePayload({
  company, eNcf, sales,
}: InvoiceDraftInput): AlanubeInvoicePayload {
  const first = sales[0];
  const totalAmount = +sales.reduce((s, l) => s + l.totalRevenue, 0).toFixed(2);
  const totalItbis  = extractItbis(totalAmount);

  const itemDetails: AlanubeItem[] = sales.map((s, i) => ({
    lineNumber: i + 1,
    billingIndicator: 1,       // 1 = ITBIS tasa general — ajustar si hay líneas exentas
    itemName: s.productName,
    goodServiceIndicator: 1,   // 1 = bien, 2 = servicio
    quantityItem: s.quantity,
    unitPriceItem: s.unitPrice,
    itemAmount: +(s.quantity * s.unitPrice).toFixed(2),
  }));

  return {
    // LogiAnalytics es la cuenta principal en Alanube; cada empresa/tenant
    // que factura es una compañía asociada (ver Configuración → alanubeCompanyId).
    // Si todavía no se registró como asociada, se omite y Alanube emitiría
    // con la cuenta principal — probablemente no es lo que se quiere en
    // multiempresa real, así que conviene tratar esto como requerido antes
    // de ir a producción con más de un tenant.
    company: company.alanubeCompanyId ? { id: company.alanubeCompanyId } : undefined,
    idDoc: {
      encf: eNcf,
      paymentType: 1,   // 1 = contado — TODO: mapear desde Sale.paymentStatus cuando haya tabla de códigos DGII confirmada
      incomeType: 1,    // 1 = ingresos por operaciones
    },
    sender: {
      rnc: company.rif,
      companyName: company.name,
      address: company.address,
      stampDate: new Date().toISOString().slice(0, 10),
    },
    buyer: first.clientRnc
      ? { rnc: first.clientRnc, name: first.client, address: first.clientAddress }
      : undefined,
    totals: { totalAmount, totalItbis },
    itemDetails,
  };
}
