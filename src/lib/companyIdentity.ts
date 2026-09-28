import { getCompany } from "@/lib/firestore/companies";
import type { UserProfile } from "@/types";

export interface InvoiceCompanyInfo {
  companyName?: string;
  companyLogoUrl?: string;
  companyRif?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
}

/**
 * Nombre/logo a mostrar en una factura — una sola fuente de verdad para los
 * dos lugares que arman una InvoiceData (ventas/page.tsx: al registrar una
 * venta y al reabrir una ya existente). Antes cada uno repetía la misma
 * lógica y ninguno tenía un fallback si `companies/{companyId}` no existía
 * (caso muy común — ver companies.ts: el doc es opcional, se crea solo si el
 * admin llena "Configuración → Empresa") — el nombre quedaba `undefined` y
 * la factura mostraba el literal "Mi Empresa" aunque el perfil SÍ tuviera un
 * nombre de empresa (`profile.companyName`, seteado por el onboarding).
 *
 * Orden: nombre comercial (Company.tradeName) → razón social fiscal
 * (Company.name) → nombre de empresa del perfil (profile.companyName) → sin
 * dato (InvoiceModal muestra su propio último recurso). El RIF/dirección/
 * teléfono/email fiscales SIEMPRE vienen de `Company` — nunca se inventan ni
 * se completan con otra fuente, para no mezclar datos fiscales con datos de
 * presentación.
 */
export async function resolveInvoiceCompanyInfo(profile: UserProfile | null | undefined): Promise<InvoiceCompanyInfo> {
  let company = null;
  if (profile?.companyId) {
    try {
      company = await getCompany(profile.companyId);
    } catch (e) {
      // Antes este error se tragaba en silencio (catch vacío) y la factura
      // simplemente caía a "Mi Empresa" sin dejar rastro de que en realidad
      // falló la carga (vs. que la empresa nunca se registró). Ahora al
      // menos queda logueado para poder distinguir ambos casos.
      console.error(`resolveInvoiceCompanyInfo: error cargando companies/${profile.companyId}`, e);
    }
  }

  return {
    companyName: company?.tradeName || company?.name || profile?.companyName || undefined,
    companyLogoUrl: company?.logoUrl,
    companyRif: company?.rif,
    companyPhone: company?.phone,
    companyEmail: company?.email,
    companyAddress: company?.address,
  };
}
