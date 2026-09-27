import type { Department } from "@/types";

export type ModuleKey =
  | "dashboard"
  | "ventas"
  | "clientes"
  | "cuentasPorCobrar"
  | "caja"
  | "compras"
  | "proveedores"
  | "inventario"
  | "insumos"
  | "rutas"
  | "recepciones"
  | "rentabilidad"
  | "configuracion"
  | "equipo"
  | "facturacionElectronica"
  | "catalogo";

/**
 * Módulos OPT-IN: apagados por defecto para TODAS las empresas, a diferencia
 * del resto (que empiezan prendidos y se apagan por empresa vía
 * `disabledModules`). Solo aparecen para quien tenga el key acá listado en
 * `UserProfile.enabledModules`. Primer uso: catálogo público de Stefany's
 * Creations — no tiene sentido que le aparezca a una empresa que no lo pidió.
 */
const OPT_IN_MODULES: ModuleKey[] = ["catalogo"];

const ALL: Department[] = ["admin", "ventas", "compras", "logistica"];

export const MODULE_ACCESS: Record<ModuleKey, { edit: Department[]; readOnly?: Department[] }> = {
  dashboard:         { edit: ALL },
  ventas:            { edit: ["admin", "ventas"] },
  clientes:          { edit: ["admin", "ventas"] },
  cuentasPorCobrar:  { edit: ["admin", "ventas"] },
  caja:              { edit: ["admin", "ventas"] },
  compras:           { edit: ["admin", "compras"] },
  proveedores:       { edit: ["admin", "compras"] },
  inventario:        { edit: ["admin", "logistica"], readOnly: ["ventas"] },
  // Materia prima/insumos y su costo real de producción: solo la dueña, a pedido del usuario.
  insumos:           { edit: ["admin"] },
  rutas:             { edit: ["admin", "logistica"] },
  recepciones:       { edit: ["admin", "logistica"] },
  rentabilidad:      { edit: ["admin"] },
  configuracion:     { edit: ALL },
  equipo:            { edit: ["admin"] },
  // Ventas emite e-CF desde sus propias ventas; Admin ve/gestiona todo.
  facturacionElectronica: { edit: ["admin", "ventas"] },
  // Catálogo público + bandeja de solicitudes: mismo criterio que Ventas
  // (Admin y Ventas preparan cotizaciones y las convierten en venta).
  catalogo:          { edit: ["admin", "ventas"] },
};

/** Maps a pathname prefix to the module it belongs to, for route guarding. */
export const ROUTE_MODULE: Record<string, ModuleKey> = {
  "/dashboard": "dashboard",
  "/ventas": "ventas",
  "/clientes": "clientes",
  "/cuentas-por-cobrar": "cuentasPorCobrar",
  "/compras": "compras",
  "/proveedores": "proveedores",
  "/inventario": "inventario",
  "/insumos": "insumos",
  "/rutas": "rutas",
  "/recepciones": "recepciones",
  "/rentabilidad": "rentabilidad",
  "/configuracion": "configuracion",
  "/equipo": "equipo",
  "/facturacion-electronica": "facturacionElectronica",
  "/catalogo": "catalogo",
  "/solicitudes": "catalogo",
};

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = Object.keys(ROUTE_MODULE).find(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
  return match ? ROUTE_MODULE[match] : null;
}

// `disabledModules` viene del doc del Admin dueño del workspace (ver
// UserProfile.disabledModules) — un módulo desactivado ahí gana sobre
// cualquier rol, incluido Admin: es una decisión de "esta empresa puntual no
// usa esta parte de la app", no una restricción de permisos.
function optInBlocked(moduleKey: ModuleKey, enabledModules?: string[]): boolean {
  return OPT_IN_MODULES.includes(moduleKey) && !enabledModules?.includes(moduleKey);
}

export function canEditModule(
  role: Department, moduleKey: ModuleKey, disabledModules?: string[], enabledModules?: string[]
): boolean {
  if (disabledModules?.includes(moduleKey)) return false;
  if (optInBlocked(moduleKey, enabledModules)) return false;
  return MODULE_ACCESS[moduleKey].edit.includes(role);
}

export function canViewModule(
  role: Department, moduleKey: ModuleKey, disabledModules?: string[], enabledModules?: string[]
): boolean {
  if (disabledModules?.includes(moduleKey)) return false;
  if (optInBlocked(moduleKey, enabledModules)) return false;
  const access = MODULE_ACCESS[moduleKey];
  return access.edit.includes(role) || (access.readOnly?.includes(role) ?? false);
}
