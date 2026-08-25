import { Timestamp } from "firebase/firestore";

export type Department = "admin" | "ventas" | "compras" | "logistica";

/** Solo tiene sentido en el doc del Admin dueño de un workspace (`id === workspaceId`). Controla acceso real vía firestore.rules — ver `workspaceIsActive()`. */
export type WorkspaceStatus = "pending" | "active" | "suspended" | "cancelled";
/** Seguimiento de facturación del workspace (no confundir con `PaymentStatus` de Sale, más abajo). */
export type WorkspacePaymentStatus = "current" | "due";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: Department;
  subscriptionPlan: "free" | "basic" | "pro";
  /** Id of the `companies/{id}` profile doc (name, RIF, address...). Unrelated to data scoping. */
  companyId?: string;
  companyName?: string;
  /** Scopes all operational data (inventory, sales, etc). Uid of the owning admin — equals `id` for the admin/owner themselves. */
  workspaceId?: string;
  photoURL?: string;
  onboardingCompleted?: boolean;
  /** Gates the platform-wide /admin panel (feedback + all-companies user list). Only true for the LogiAnalytics operator account. */
  platformAdmin?: boolean;
  /** Cuenta puramente operativa (el dueño de la plataforma, sin negocio propio) — su única interfaz es /admin, nunca ve Sidebar/Inventario/Ventas/etc. Solo tiene efecto junto con platformAdmin:true. */
  platformOnly?: boolean;
  /** Solo en el doc del Admin dueño del workspace. Ausente = "active" (grandfathering de workspaces creados antes de esta feature). Ver [[project-logianalytics-pro-launch]]. */
  workspaceStatus?: WorkspaceStatus;
  paymentStatus?: WorkspacePaymentStatus;
  nextPaymentDate?: string;
  billingNotes?: string;
  approvedAt?: Timestamp;
  /** FCM registration tokens, one per browser/device where the user granted push permission. */
  fcmTokens?: string[];
  createdAt: Timestamp;
  lastLogin?: Timestamp;
}

export type TaxpayerType = "grande" | "mediano" | "pequeno" | "micro";

export interface Company {
  id: string;
  name: string;
  rif: string;
  address: string;
  phone: string;
  email: string;
  industry: string;
  country: string;
  ownerId: string;
  createdAt: Timestamp;
  // ─── Facturación electrónica (DGII / e-CF, República Dominicana) ───────────
  /** Categoría de contribuyente ante DGII — define el plazo de obligatoriedad del e-CF. */
  taxpayerType?: TaxpayerType;
  /** Ambiente del facilitador (Alanube): pruebas hasta certificar, luego producción. */
  eCfEnvironment?: "sandbox" | "production";
  /** Id de la empresa dentro de Alanube, devuelto al darla de alta vía su API (createCompany). */
  alanubeCompanyId?: string;
  /**
   * Rangos de e-NCF autorizados por DGII, uno por tipo de comprobante.
   * Se configuran a mano en Configuración cuando DGII aprueba el rango
   * ("Autorización de Comprobantes Fiscales Electrónicos"). Sin esto no se
   * puede emitir — no inventamos numeración.
   */
  eCfSequences?: Partial<Record<ECfType, { nextNumber: number; rangeEnd: number }>>;
}

export interface PriceHistoryEntry {
  date: Timestamp;
  unitCost: number;
  salePrice: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  color: string;
  supplier: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitCost: number;
  salePrice: number;
  dailyDemand?: number;
  leadTimeDays: number;
  imageUrl?: string;
  updatedAt: Timestamp;
  priceHistory?: PriceHistoryEntry[];
}

export type StockStatus = "critical" | "low" | "ok";

export interface InventoryItemWithStatus extends InventoryItem {
  status: StockStatus;
}

export interface InventoryMovement {
  id: string;
  inventoryId: string;
  sku: string;
  productName: string;
  movementType: "sale" | "purchase" | "adjustment" | "production";
  quantity: number;
  reference: string;
  note: string;
  serialNumber?: string;
  batchCode?: string;
  receiptPhotoUrl?: string;
  createdAt: Timestamp;
}

export type PaymentStatus = "pagado" | "pendiente" | "credito";
export type NcfType = "B01" | "B02" | "B14" | "B15";

export interface Sale {
  id: string;
  saleOrderId?: string;
  invoiceNumber?: string;
  ncf?: string;
  inventoryId: string;
  sku: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  route: string;
  zone: string;
  // Client details
  client: string;
  clientRnc?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  notes?: string;
  paymentStatus: PaymentStatus;
  dueDate?: Timestamp;
  saleDate: Timestamp;
  totalRevenue: number;
  totalCost: number;
  profit: number;
}

export interface ClientStats {
  client: string;
  numSales: number;
  totalUnits: number;
  revenue: number;
  profit: number;
  marginPct: number;
}

export interface SalesSummary {
  numSales: number;
  totalUnits: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface RouteStats {
  route: string;
  numSales: number;
  totalUnits: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface ProductStats {
  sku: string;
  productName: string;
  category: string;
  numSales: number;
  totalUnits: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface DailyStat {
  date: string;
  revenue: number;
  profit: number;
}

export const INDUSTRIES = [
  "Logística / Transporte",
  "Comercio / Retail",
  "Manufactura",
  "Distribución",
  "Alimentos y Bebidas",
  "Tecnología",
  "Otro",
] as const;

export const COUNTRIES = [
  "República Dominicana",
  "Venezuela",
  "Colombia",
  "México",
  "Argentina",
  "Chile",
  "Perú",
  "Ecuador",
  "Uruguay",
  "Otro",
] as const;

// Las 32 regiones de República Dominicana (31 provincias + Distrito Nacional) con la
// coordenada real de su ciudad cabecera — fuente de verdad para ubicar rutas en el mapa
// (ver src/components/map/RouteMap.tsx). Es el mercado real de la app: todo el motor fiscal
// (RNC, ITBIS, e-CF/DGII) ya es dominicano, así que esto va sin gating por país seleccionado.
export const DOMINICAN_PROVINCES = [
  { name: "Distrito Nacional",        lat: 18.4861, lng: -69.9312 },
  { name: "Azua",                     lat: 18.4539, lng: -70.7358 },
  { name: "Baoruco",                  lat: 18.4864, lng: -71.4241 },
  { name: "Barahona",                 lat: 18.2085, lng: -71.1002 },
  { name: "Dajabón",                  lat: 19.5490, lng: -71.7089 },
  { name: "Duarte",                   lat: 19.3008, lng: -70.2540 },
  { name: "Elías Piña",               lat: 18.8748, lng: -71.6825 },
  { name: "El Seibo",                 lat: 18.7644, lng: -69.0392 },
  { name: "Espaillat",                lat: 19.3945, lng: -70.5271 },
  { name: "Hato Mayor",               lat: 18.7667, lng: -69.2500 },
  { name: "Hermanas Mirabal",         lat: 19.3810, lng: -70.4152 },
  { name: "Independencia",            lat: 18.4922, lng: -71.8511 },
  { name: "La Altagracia",            lat: 18.6147, lng: -68.7078 },
  { name: "La Romana",                lat: 18.4273, lng: -68.9728 },
  { name: "La Vega",                  lat: 19.2233, lng: -70.5287 },
  { name: "María Trinidad Sánchez",   lat: 19.3801, lng: -69.8489 },
  { name: "Monseñor Nouel",           lat: 18.9388, lng: -70.4083 },
  { name: "Monte Cristi",             lat: 19.8508, lng: -71.6492 },
  { name: "Monte Plata",              lat: 18.8083, lng: -69.7833 },
  { name: "Pedernales",               lat: 18.0384, lng: -71.7434 },
  { name: "Peravia",                  lat: 18.2799, lng: -70.3308 },
  { name: "Puerto Plata",             lat: 19.7934, lng: -70.6884 },
  { name: "Samaná",                   lat: 19.2058, lng: -69.3364 },
  { name: "San Cristóbal",            lat: 18.4167, lng: -70.1058 },
  { name: "San José de Ocoa",         lat: 18.5442, lng: -70.5044 },
  { name: "San Juan",                 lat: 18.8058, lng: -71.2295 },
  { name: "San Pedro de Macorís",     lat: 18.4539, lng: -69.3084 },
  { name: "Sánchez Ramírez",          lat: 19.0533, lng: -70.1517 },
  { name: "Santiago",                 lat: 19.4517, lng: -70.6970 },
  { name: "Santiago Rodríguez",       lat: 19.4831, lng: -71.3350 },
  { name: "Santo Domingo",            lat: 18.5001, lng: -69.8850 },
  { name: "Valverde",                 lat: 19.5497, lng: -71.0783 },
] as const;

export const PERIOD_OPTIONS = [7, 15, 30, 60, 90, 180] as const;
export type Period = (typeof PERIOD_OPTIONS)[number];

export const LOW_STOCK_THRESHOLD = 0.25;

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  rnc: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Compras ─────────────────────────────────────────────────────────────────

export type PurchaseOrderStatus = "pendiente" | "recibida" | "parcial" | "cancelada";

export interface PurchaseOrderItem {
  inventoryId: string;
  sku: string;
  productName: string;
  category: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  total: number;
  // Reception metadata
  serialNumber?: string;
  batchCode?: string;
  receiptPhotoUrl?: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  supplierRnc: string;
  supplierPhone: string;
  supplierEmail: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  note: string;
  expectedDate: Timestamp;
  receivedDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Insumos (materia prima) ──────────────────────────────────────────────────
// Para clientes que fabrican su propio producto (ej. artesanías con limpiapipas):
// sin motor de "receta" fija — cada tanda de producción declara a mano qué insumos
// y cuánto consumió, y de ahí sale el costo real por unidad (ver src/lib/firestore/production.ts).

export interface RawMaterialPriceHistoryEntry {
  date: Timestamp;
  unitCost: number;
}

export interface RawMaterial {
  id: string;
  name: string;
  /** Unidad de medida en texto libre: "unidad", "kg", "g", "L", "ml", "m", "paquete"... */
  unit: string;
  unitCost: number;
  currentStock: number;
  minStock: number;
  supplier: string;
  notes: string;
  updatedAt: Timestamp;
  priceHistory?: RawMaterialPriceHistoryEntry[];
}

export type RawMaterialMovementType = "compra" | "produccion" | "ajuste";

export interface RawMaterialMovement {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  movementType: RawMaterialMovementType;
  /** Positivo = entrada (compra/ajuste), negativo = salida (consumido en producción). */
  quantity: number;
  reference: string;
  note: string;
  createdAt: Timestamp;
}

export interface ProductionConsumedItem {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  quantityUsed: number;
  /** Costo del insumo al momento de producir (snapshot, no cambia si luego se edita el insumo). */
  unitCost: number;
  totalCost: number;
}

export interface ProductionRecord {
  id: string;
  inventoryId: string;
  sku: string;
  productName: string;
  quantityProduced: number;
  consumedItems: ProductionConsumedItem[];
  materialsCost: number;
  laborCost: number;
  otherCosts: number;
  totalCost: number;
  costPerUnit: number;
  note: string;
  createdAt: Timestamp;
}

// ─── Facturación electrónica (e-CF / DGII) ────────────────────────────────────
// Códigos oficiales de comprobante fiscal electrónico (Ley 32-23 / Decreto 587-24).
// Cubrimos por ahora los que puede emitir un negocio de ventas/logística; el resto
// (regímenes especiales, gubernamental, exportación, pagos al exterior) se agregan
// si algún cliente los necesita.
export type ECfType =
  | "31" // Factura de Crédito Fiscal Electrónica
  | "32" // Factura de Consumo Electrónica
  | "33" // Nota de Débito Electrónica
  | "34" // Nota de Crédito Electrónica
  | "41"; // Comprobante Electrónico de Compras

export const ECF_TYPE_LABELS: Record<ECfType, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
  "41": "Comprobante de Compras",
};

export type ECfStatus =
  | "borrador"   // armado localmente, aún no enviado
  | "enviado"    // enviado a Alanube, esperando respuesta de DGII
  | "aceptado"   // DGII aceptó el e-CF
  | "rechazado"  // DGII lo rechazó (ver errorMessage)
  | "anulado"    // anulado después de aceptado
  | "error";     // falló la llamada a Alanube antes de llegar a DGII

export interface ElectronicInvoice {
  id: string;
  /** Vínculo con la venta origen. Para ventas multi-ítem, todas comparten saleOrderId. */
  saleOrderId?: string;
  saleIds: string[];
  eCfType: ECfType;
  status: ECfStatus;
  /** e-NCF asignado (ej. E320000000005). Ausente mientras status === "borrador". */
  eNcf?: string;
  buyerRnc?: string;
  buyerName: string;
  totalAmount: number;
  itbis: number;
  currency: string;
  /** Id de seguimiento devuelto por Alanube/DGII. */
  trackId?: string;
  securityCode?: string;
  /** URL de la representación impresa (PDF) del e-CF, si Alanube ya la generó. */
  printUrl?: string;
  errorMessage?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
