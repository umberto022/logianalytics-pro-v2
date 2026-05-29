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
  createdAt: Timestamp;
}

export interface Sale {
  id: string;
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
  saleDate: Timestamp;
  totalRevenue: number;
  totalCost: number;
  profit: number;
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
