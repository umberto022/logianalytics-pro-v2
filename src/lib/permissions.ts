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
  | "facturacionElectronica";

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
};

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = Object.keys(ROUTE_MODULE).find(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
  return match ? ROUTE_MODULE[match] : null;
}

export function canEditModule(role: Department, moduleKey: ModuleKey): boolean {
  return MODULE_ACCESS[moduleKey].edit.includes(role);
}

export function canViewModule(role: Department, moduleKey: ModuleKey): boolean {
  const access = MODULE_ACCESS[moduleKey];
  return access.edit.includes(role) || (access.readOnly?.includes(role) ?? false);
}
