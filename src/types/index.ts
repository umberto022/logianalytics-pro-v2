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
  /**
   * Solo en el doc del Admin dueño del workspace. Módulos (ModuleKey de
   * permissions.ts, tipado como string acá para evitar el import circular
   * types↔permissions) desactivados a pedido de ESTA empresa puntual — no es
   * un rol, aplica incluso al Admin. Ausente/vacío = todos los módulos que su
   * rol permitiría siguen disponibles (comportamiento sin cambios).
   */
  disabledModules?: string[];
  /**
   * Solo en el doc del Admin dueño del workspace. Módulos OPT-IN (apagados por
   * defecto para todos) que esta empresa puntual pidió activar — inverso de
   * `disabledModules`. Primer uso: "catalogo" (ver [[project-logianalytics-insumos]]
   * / catálogo público de Stefany's Creations). Ausente/vacío = ninguno activo.
   */
  enabledModules?: string[];
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
  // ─── Identidad visual (menú, factura, título de pestaña) ───────────────────
  // SOLO para mostrar — nunca alimentan el e-CF/DGII (eso sigue leyendo `name`
  // y `rif` de arriba). Si `tradeName` está vacío, se usa `name` para mostrar.
  /** Nombre comercial — puede diferir de la razón social fiscal (`name`). */
  tradeName?: string;
  logoUrl?: string;
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

// ─── Catálogo público ──────────────────────────────────────────────────────
// Una variante SOLO modifica descripción/precio de presentación (ej. "Color:
// rojo", "Tamaño: grande") — comparte el stock del InventoryItem padre. No es
// un SKU independiente: evita duplicar inventario, a costa de no poder llevar
// existencias por variante en esta primera versión (limitación documentada).
export interface CatalogVariant {
  id: string;
  label: string;
  /** Si no está, la variante usa el `salePrice` del producto tal cual. */
  priceOverrideCents?: number;
}

/** Precio distinto a partir de cierta cantidad del mismo producto (ej. 3+ unidades a otro precio). */
export interface CatalogQuantityPriceRule {
  minQty: number;
  unitPriceCents: number;
}

export interface InventoryItemCatalogInfo {
  published: boolean;
  description?: string;
  variants?: CatalogVariant[];
  quantityPricing?: CatalogQuantityPriceRule[];
  /** Puede pedirse por encargo aunque currentStock sea 0. */
  allowBackorder?: boolean;
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
  /** Presencia/config en el catálogo público de esta empresa (ver [[project-logianalytics-insumos]]). Ausente = nunca se publicó. */
  catalog?: InventoryItemCatalogInfo;
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
  /** Presentes solo si esta venta vino de una CatalogQuote (ver [[project-logianalytics-insumos]]) — ventas normales nunca los llenan. */
  quoteId?: string;
  advanceAmountCents?: number;
  balanceDueCents?: number;
  /** Entrega y pago son estados independientes: confirmar/pagar un pedido no implica haberlo entregado. Ausente = sin dato (ventas de antes de esta feature). */
  deliveryStatus?: "pendiente" | "entregado";
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

export type CustomerType = "nuevo" | "frecuente";

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
  /**
   * Solo la empresa (Admin/Ventas, vía el módulo Clientes) o el sistema la
   * asignan — un visitante del catálogo público nunca puede marcarse a sí
   * mismo como "frecuente" (afecta si necesita anticipo). Ausente = "nuevo".
   */
  customerType?: CustomerType;
}

// ─── Compras ─────────────────────────────────────────────────────────────────

export type PurchaseOrderStatus = "pendiente" | "recibida" | "parcial" | "cancelada";

/** Qué se está comprando. Ausente = "producto" (compat con órdenes creadas antes de este campo). */
export type PurchaseOrderType = "producto" | "insumo";

export interface PurchaseOrderItem {
  /** Id del InventoryItem (orderType "producto") o del RawMaterial (orderType "insumo") — se mantiene el nombre por compatibilidad con órdenes ya creadas. */
  inventoryId: string;
  /** Vacío para insumos (RawMaterial no tiene SKU). */
  sku: string;
  productName: string;
  /** Vacío para insumos (RawMaterial no tiene categoría). */
  category: string;
  /** Unidad de medida (kg, L, unidad...) — solo se llena para items de orderType "insumo". */
  unit?: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  total: number;
  // Reception metadata
  serialNumber?: string;
  batchCode?: string;
  receiptPhotoUrl?: string;
  /** true = se agregó libremente al armar la orden (orderType "insumo") y todavía no existe en rawMaterials — `inventoryId` es un id temporal. Al recibir, se crea el RawMaterial real y se limpia esta bandera. */
  isNewRawMaterial?: boolean;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  orderType?: PurchaseOrderType;
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

// ─── Catálogo público (Stefany's Creations y futuras empresas) ───────────────
// Módulo opt-in (ver UserProfile.enabledModules). Nada de esto se lee/escribe
// desde el navegador de un visitante: las rutas públicas (/c/[slug] y
// /api/catalogo/*) pasan por Admin SDK server-side, nunca por firestore.rules.

export interface CatalogColors {
  primary: string;
  accent: string;
}

export interface CatalogDiscountRule {
  /** Cantidad total de unidades en el carrito a partir de la cual aplica el descuento (pueden ser del mismo producto o combinadas). */
  minQty: number;
  pct: number;
  /** El descuento se aplica solo al subtotal de productos — el envío nunca lo lleva. */
  appliesToShipping: boolean;
}

export interface CatalogAdvanceRule {
  pct: number;
  /** En centavos. Pedido "grande" a partir de este monto de productos (inclusive). */
  largeOrderThresholdCents: number;
  /** true = el umbral se evalúa sobre el total de productos YA con descuento aplicado, sin envío. */
  thresholdAfterDiscountExcludingShipping: boolean;
}

export interface CatalogSettings {
  /** Igual al workspaceId — un doc por empresa. */
  id: string;
  businessName: string;
  logoUrl?: string;
  colors: CatalogColors;
  /** Solo dígitos, con código de país (ej. "18095551234"). Vacío = todavía no configurado, no se muestra el botón de WhatsApp. */
  whatsappNumber?: string;
  pickup: { enabled: boolean; address?: string };
  delivery: { enabled: boolean; zones: string[] };
  /** Slug único para /c/[slug] — no expone el uid/email de la dueña. */
  publicSlug: string;
  /** Stefany debe publicar explícitamente desde "Mi catálogo" — nunca queda público solo. */
  enabled: boolean;
  discountRule: CatalogDiscountRule;
  advanceRule: CatalogAdvanceRule;
  /**
   * true = el precio publicado es el precio final del producto — el
   * catálogo/cotización de ESTA empresa no suma cargos adicionales encima.
   * Es una decisión de cómo esta empresa presenta sus precios, no una
   * exención fiscal: no toca la configuración de e-CF/DGII (ver Company/
   * ElectronicInvoice) ni la de ninguna otra empresa.
   */
  pricesAreFinal: boolean;
  /**
   * La empresa (o quien la representa) debe revisar y confirmar
   * explícitamente discountRule/advanceRule/pricesAreFinal antes de poder
   * publicar — bloquea "Publicar catálogo" en /catalogo mientras sea false;
   * la vista previa interna (/catalogo/vista-previa) sigue disponible
   * siempre, confirmado o no.
   */
  commercialRulesConfirmed: boolean;
  commercialRulesConfirmedBy?: string;
  commercialRulesConfirmedAt?: Timestamp;
  /**
   * Consentimiento explícito para recibir el aviso automático de nuevas
   * solicitudes por WhatsApp (Cloud API) en `whatsappNumber`. Ausente/false =
   * no se crea ningún job de notificación — la solicitud se guarda igual,
   * simplemente no se avisa por WhatsApp (Stefany la ve en Solicitudes).
   */
  whatsappNotificationsConsent?: boolean;
  whatsappNotificationsConsentBy?: string;
  whatsappNotificationsConsentAt?: Timestamp;
  /** Texto de plazo mostrado en el catálogo — nunca se promete una fecha automática. */
  leadTimeNote: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CatalogQuoteStatus =
  | "recibida"
  | "preparada"
  | "enviada"
  | "aceptada"
  | "pendiente_anticipo"
  | "confirmado"
  | "convertida"
  | "cancelada";

export interface CatalogQuoteItem {
  inventoryId: string;
  sku: string;
  productName: string;
  category: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
  /** Snapshot del precio unitario calculado server-side al momento de la solicitud (nunca el que mande el navegador). */
  unitPriceCents: number;
  /** true = no había stock suficiente al momento de la solicitud (o el producto se ofrece siempre por encargo). */
  isBackorder: boolean;
}

export interface CatalogQuoteHistoryEntry {
  action: string;
  by: string;
  at: Timestamp;
  note?: string;
}

export interface CatalogQuotePayment {
  amountCents: number;
  method?: string;
  note?: string;
  recordedBy: string;
  recordedAt: Timestamp;
}

export interface CatalogQuote {
  id: string;
  /** Referencia corta para que el cliente la use al hablar por WhatsApp — no sirve para consultar la solicitud públicamente, no hay endpoint de lectura pública. */
  publicRef: string;
  status: CatalogQuoteStatus;
  items: CatalogQuoteItem[];
  subtotalCents: number;
  discountCents: number;
  discountPct: number;
  /** subtotal - descuento. */
  productsTotalCents: number;
  /** undefined mientras no se haya cotizado el envío ("Envío por cotizar"). */
  shippingCents?: number;
  /** undefined mientras falte el envío — nunca se muestra/guarda un total definitivo a medias. */
  totalCents?: number;
  deliveryMethod: "retiro" | "entrega";
  zone?: string;
  address?: string;
  customerName: string;
  /** Con código de país, tal como lo ingresó el cliente. */
  customerPhone: string;
  customerNote?: string;
  customerId?: string;
  /** Resuelto server-side desde el Customer existente (o "nuevo" si no había) — el visitante nunca lo envía. */
  customerType: CustomerType;
  requiresAdvance: boolean;
  advancePct?: number;
  advanceAmountCents?: number;
  payments?: CatalogQuotePayment[];
  balanceDueCents?: number;
  leadTimeNote: string;
  /** Incrementa cada vez que Stefany cambia precios/envío/descuento después de creada. */
  revision: number;
  /** Qué revisión aceptó el cliente — si Stefany cambia la cotización después, queda claro que el cliente no aceptó la versión nueva todavía. */
  acceptedVersion?: number;
  saleOrderId?: string;
  history: CatalogQuoteHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Aviso automático por WhatsApp (Cloud API de Meta) ───────────────────────
// Un job por solicitud (doc id == quoteId), creado atómicamente junto con la
// CatalogQuote. Nunca lo escribe el cliente — solo el servidor (creación,
// cron de reintentos, webhook de estado). Ver src/lib/whatsappNotificationJob.ts.

export type WhatsappNotificationStatus =
  | "pending"      // creado (o esperando el próximo reintento) — todavía no se llamó a Meta en este turno
  | "sending"      // un worker lo tomó (lease con vencimiento) y está llamando a Meta ahora mismo
  | "unconfirmed"  // timeout/corte AMBIGUO: puede que Meta sí lo haya procesado — NO se reenvía a ciegas; se reconcilia por webhook o lo revisa un humano
  | "accepted"     // Meta aceptó la petición (HTTP 200 + wamid) — NO prueba que salió ni que llegó
  | "sent"         // webhook de Meta: el mensaje salió de la plataforma hacia WhatsApp
  | "delivered"    // webhook de Meta: entregado al dispositivo
  | "read"         // webhook de Meta: leído (señal extra, no crítica)
  | "failed"       // error permanente, agotó los reintentos, o el webhook informó una falla de entrega
  | "expired";     // demasiado viejo para enviarse automáticamente (protección contra envíos masivos de avisos atrasados)

export interface WhatsappNotificationJob {
  id: string; // == quoteId
  quoteId: string;
  status: WhatsappNotificationStatus;
  /** Intentos REALES contra Meta (una configuración ausente o un lease ajeno no consumen intentos). */
  attempts: number;
  maxAttempts: number;
  /** Próximo momento en que un worker puede tomarlo. Mientras status="sending", es el vencimiento del lease. */
  nextAttemptAt: Timestamp;
  lastAttemptAt?: Timestamp;
  /** Dueño del lease vigente (id aleatorio por toma) — solo quien lo tomó puede cerrar ese intento. */
  leaseOwner?: string;
  /** Hasta cuándo esperar un webhook que reconcilie un envío ambiguo antes de dejarlo para revisión humana. */
  reconcileUntil?: Timestamp;
  /** wamid devuelto por Meta al aceptar el envío — se usa para matchear los webhooks de estado. */
  providerMessageId?: string;
  /** Timestamp del último evento de estado aplicado (del webhook). */
  lastStatusAt?: Timestamp;
  /** Resumen seguro del último error (código/mensaje de Meta) — nunca el payload crudo ni credenciales. */
  lastErrorSafe?: string;
  /** Snapshot del número receptor (E.164) tomado de la configuración protegida (catalogSettings.whatsappNumber). */
  recipientPhone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
