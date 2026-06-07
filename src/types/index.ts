import { Timestamp } from "firebase/firestore";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: "admin" | "user";
  subscriptionPlan: "free" | "basic" | "pro";
  companyId?: string;
  companyName?: string;
  createdAt: Timestamp;
  lastLogin?: Timestamp;
}

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

export interface Sale {
  id: string;
  saleOrderId?: string;
  inventoryId: string;
  sku: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  route: string;
  zone: string;
  client: string;
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
