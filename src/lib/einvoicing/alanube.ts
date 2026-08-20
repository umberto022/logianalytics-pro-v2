/**
 * Cliente para la API de Alanube (proveedor de servicios de facturación
 * electrónica homologado por DGII — https://developer.alanube.co/).
 *
 * OJO: los endpoints/campos de abajo salen de la documentación pública
 * (developer.alanube.co/reference/createinvoices, createcompany-1) leída sin
 * acceso a sandbox real todavía. Antes de emitir en serio hay que:
 *   1. Crear cuenta en Alanube y pedir credenciales de sandbox.
 *   2. Probar `alanubeCreateInvoice` contra sandbox con una venta real y
 *      comparar la respuesta con lo que se asume en `AlanubeInvoiceResponse`.
 *   3. Ajustar `mapper.ts` si algún campo obligatorio falta o cambió.
 */

export type AlanubeEnv = "sandbox" | "production";

const BASE_URL: Record<AlanubeEnv, string> = {
  sandbox: "https://sandbox.alanube.co/dom/v1",
  production: "https://api.alanube.co/dom/v1",
};

export interface AlanubeIdDoc {
  encf: string;
  /** 1 = contado, 2 = crédito, etc. — ver tabla de formas de pago DGII. */
  paymentType: number;
  /** 1 = ingresos por operaciones, ver tabla "tipos de ingreso" DGII. */
  incomeType: number;
}

export interface AlanubeParty {
  rnc: string;
  companyName?: string;
  name?: string;
  address?: string;
  /** Requerida por Alanube en `sender`; formato YYYY-MM-DD. */
  stampDate?: string;
}

export interface AlanubeItem {
  lineNumber: number;
  billingIndicator: number;
  itemName: string;
  goodServiceIndicator: number;
  quantityItem: number;
  unitPriceItem: number;
  itemAmount: number;
}

export interface AlanubeInvoicePayload {
  /**
   * Empresa asociada con la que se emite, cuando el token es de una cuenta
   * principal revendedora (nuestro caso: LogiAnalytics es la cuenta padre en
   * Alanube, cada empresa/tenant que factura es una "compañía asociada").
   * Omitir solo si se está emitiendo con la compañía principal del token.
   */
  company?: { id: string };
  idDoc: AlanubeIdDoc;
  sender: AlanubeParty;
  buyer?: AlanubeParty;
  totals: { totalAmount: number; totalItbis?: number };
  itemDetails: AlanubeItem[];
}

export interface AlanubeInvoiceResponse {
  trackId?: string;
  encf?: string;
  securityCode?: string;
  printUrl?: string;
  status?: string;
  [key: string]: unknown;
}

export class AlanubeError extends Error {
  constructor(public status: number, public body: unknown) {
    super(
      `Alanube respondió ${status}: ${
        typeof body === "object" ? JSON.stringify(body) : String(body)
      }`
    );
    this.name = "AlanubeError";
  }
}

interface AlanubeConfig {
  apiKey: string;
  env: AlanubeEnv;
}

/** Lee la config desde variables de entorno de servidor. Nunca exponer al cliente. */
export function getAlanubeConfig(): AlanubeConfig | null {
  const apiKey = process.env.ALANUBE_API_KEY;
  if (!apiKey) return null;
  const env = (process.env.ALANUBE_ENV as AlanubeEnv) || "sandbox";
  return { apiKey, env };
}

async function alanubeFetch<T>(
  config: AlanubeConfig,
  path: string,
  init: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL[config.env]}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new AlanubeError(res.status, body);
  return body as T;
}

/** Emite una Factura de Consumo Electrónica (E32) o de Crédito Fiscal (E31). */
export async function alanubeCreateInvoice(
  config: AlanubeConfig,
  payload: AlanubeInvoicePayload,
  eCfType: "31" | "32"
): Promise<AlanubeInvoiceResponse> {
  // E31 y E32 son endpoints distintos en la API de Alanube.
  const path = eCfType === "31" ? "/fiscal-invoices" : "/invoices";
  return alanubeFetch<AlanubeInvoiceResponse>(config, path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Consulta el estado de un e-CF ya emitido (por si el registro local quedó
 * "enviado" sin confirmar). El path de consulta para E31 no está confirmado
 * en la documentación pública leída — verificar en sandbox antes de usar
 * este helper con `eCfType === "31"`.
 */
export async function alanubeCheckInvoice(
  config: AlanubeConfig,
  trackId: string,
  eCfType: "31" | "32"
): Promise<AlanubeInvoiceResponse> {
  const path = eCfType === "31" ? "/fiscal-invoices" : "/invoices";
  return alanubeFetch<AlanubeInvoiceResponse>(config, `${path}/${trackId}`, {
    method: "GET",
  });
}
