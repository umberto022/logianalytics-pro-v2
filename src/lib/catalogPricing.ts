// Única fuente de verdad para el cálculo de precios del catálogo — la usan el
// carrito público (estimado visual), la API de solicitud (autoritativo,
// recalculado server-side contra el inventario real) y la bandeja de
// solicitudes (al preparar la cotización final con envío conocido). Mismo
// cálculo siempre, en centavos, para que no puedan divergir cliente/servidor.
import type { CatalogAdvanceRule, CatalogDiscountRule, CustomerType } from "@/types";
import { pctOfCents } from "@/lib/money";

export interface CartPricingLine {
  unitPriceCents: number;
  quantity: number;
}

export interface CartPricingResult {
  subtotalCents: number;
  totalQty: number;
  discountApplies: boolean;
  discountPct: number;
  discountCents: number;
  /** subtotal - descuento. El descuento NUNCA alcanza el envío (regla provisional confirmada). */
  productsTotalCents: number;
  shippingCents?: number;
  /** undefined mientras no haya envío cotizado — nunca mostrar/guardar un total definitivo a medias. */
  totalCents?: number;
  requiresAdvance: boolean;
  advancePct?: number;
  advanceAmountCents: number;
  balanceDueCents?: number;
}

export function computeCartPricing(
  items: CartPricingLine[],
  opts: {
    customerType: CustomerType;
    discountRule: CatalogDiscountRule;
    advanceRule: CatalogAdvanceRule;
    /** undefined = todavía "Envío por cotizar". */
    shippingCents?: number;
  }
): CartPricingResult {
  const subtotalCents = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);

  const discountApplies = totalQty >= opts.discountRule.minQty;
  const discountCents = discountApplies ? pctOfCents(subtotalCents, opts.discountRule.pct) : 0;
  const productsTotalCents = subtotalCents - discountCents;

  const shippingCents = opts.shippingCents;
  const totalCents = shippingCents !== undefined ? productsTotalCents + shippingCents : undefined;

  // "Cliente frecuente: pago contra entrega, salvo pedido grande. Cliente
  // nuevo: siempre anticipo." — el umbral de pedido grande se evalúa sobre el
  // total de productos YA con descuento, sin envío (regla provisional).
  const isLargeOrder = productsTotalCents >= opts.advanceRule.largeOrderThresholdCents;
  const requiresAdvance = opts.customerType === "nuevo" || isLargeOrder;
  const advanceAmountCents = requiresAdvance ? pctOfCents(productsTotalCents, opts.advanceRule.pct) : 0;
  const balanceDueCents = totalCents !== undefined ? totalCents - advanceAmountCents : undefined;

  return {
    subtotalCents,
    totalQty,
    discountApplies,
    discountPct: discountApplies ? opts.discountRule.pct : 0,
    discountCents,
    productsTotalCents,
    shippingCents,
    totalCents,
    requiresAdvance,
    advancePct: requiresAdvance ? opts.advanceRule.pct : undefined,
    advanceAmountCents,
    balanceDueCents,
  };
}
