import { Timestamp } from "firebase/firestore";

export type Department = "admin" | "ventas" | "compras" | "logistica";

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
  movementType: "sale" | "purchase" | "adjustment";
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
