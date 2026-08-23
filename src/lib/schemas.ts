import { z } from "zod";

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventorySchema = z.object({
  name:         z.string().min(1, "El nombre es obligatorio").max(120),
  category:     z.string().min(1, "La categoría es obligatoria"),
  color:        z.string().max(50).default(""),
  supplier:     z.string().max(120).default(""),
  currentStock: z.number({ error: "Debe ser un número" }).int().min(0, "Stock mínimo 0"),
  minStock:     z.number({ error: "Debe ser un número" }).int().min(0),
  maxStock:     z.number({ error: "Debe ser un número" }).int().min(1, "Stock máximo mínimo 1"),
  unitCost:     z.number({ error: "Debe ser un número" }).min(0, "El costo no puede ser negativo"),
  salePrice:    z.number({ error: "Debe ser un número" }).min(0, "El precio no puede ser negativo"),
  leadTimeDays: z.number({ error: "Debe ser un número" }).int().min(0).default(7),
  imageUrl:     z.string().optional().default(""),
}).refine((d) => d.salePrice >= d.unitCost, {
  message: "El precio de venta debe ser mayor o igual al costo",
  path: ["salePrice"],
}).refine((d) => d.maxStock >= d.minStock, {
  message: "El stock máximo debe ser mayor o igual al mínimo",
  path: ["maxStock"],
});

export type InventoryFormValues = z.infer<typeof inventorySchema>;

// ─── Customer ─────────────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name:    z.string().min(1, "El nombre es obligatorio").max(120),
  rnc:     z.string().max(20).default(""),
  phone:   z.string().max(30).default(""),
  email:   z.union([z.string().email("Email inválido"), z.literal("")]).default(""),
  address: z.string().max(200).default(""),
  notes:   z.string().max(500).default(""),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

// ─── Supplier ─────────────────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name:    z.string().min(1, "El nombre es obligatorio").max(120),
  rnc:     z.string().max(20).default(""),
  phone:   z.string().max(30).default(""),
  email:   z.union([z.string().email("Email inválido"), z.literal("")]).default(""),
  address: z.string().max(200).default(""),
  notes:   z.string().max(500).default(""),
  active:  z.boolean().default(true),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;

// ─── Raw material (insumo) ─────────────────────────────────────────────────────

export const rawMaterialSchema = z.object({
  name:         z.string().min(1, "El nombre es obligatorio").max(120),
  unit:         z.string().min(1, "La unidad es obligatoria").max(20),
  unitCost:     z.number({ error: "Debe ser un número" }).min(0, "El costo no puede ser negativo"),
  currentStock: z.number({ error: "Debe ser un número" }).min(0, "Stock mínimo 0"),
  minStock:     z.number({ error: "Debe ser un número" }).min(0),
  supplier:     z.string().max(120).default(""),
  notes:        z.string().max(500).default(""),
});

export type RawMaterialFormValues = z.infer<typeof rawMaterialSchema>;

// ─── Purchase order ───────────────────────────────────────────────────────────

export const purchaseOrderSchema = z.object({
  supplierName:  z.string().min(1, "El proveedor es obligatorio"),
  supplierRnc:   z.string().max(20).default(""),
  supplierPhone: z.string().max(30).default(""),
  supplierEmail: z.union([z.string().email("Email inválido"), z.literal("")]).default(""),
  expectedDate:  z.string().min(1, "La fecha esperada es obligatoria"),
  note:          z.string().max(500).default(""),
});

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

// ─── Sale ─────────────────────────────────────────────────────────────────────

export const saleSchema = z.object({
  quantity:  z.number({ error: "Debe ser un número" }).int().min(1, "La cantidad mínima es 1"),
  unitPrice: z.number({ error: "Debe ser un número" }).min(0.01, "El precio debe ser mayor a 0"),
  route:     z.string().min(1, "La ruta es obligatoria"),
  zone:      z.string().max(80).default(""),
  client:    z.string().min(1, "El cliente es obligatorio"),
});

export type SaleFormValues = z.infer<typeof saleSchema>;

// ─── Helper: extract field errors from ZodError ───────────────────────────────

export function zodErrors(result: z.ZodSafeParseError<unknown>): Record<string, string> {
  return Object.fromEntries(
    result.error.issues.map((issue: z.ZodIssue) => [issue.path.join("."), issue.message])
  );
}
