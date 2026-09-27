import { describe, it, expect } from "vitest";
import { computeCartPricing } from "./catalogPricing";
import { toCents } from "./money";
import type { CatalogAdvanceRule, CatalogDiscountRule } from "@/types";

const discountRule: CatalogDiscountRule = { minQty: 4, pct: 20, appliesToShipping: false };
const advanceRule: CatalogAdvanceRule = {
  pct: 50,
  largeOrderThresholdCents: toCents(2000),
  thresholdAfterDiscountExcludingShipping: true,
};

describe("computeCartPricing", () => {
  // Ejemplo de la sección 6 del encargo: 4 unidades de RD$500, cliente nuevo.
  it("reproduce el ejemplo de verificación del encargo (4x RD$500, envío RD$200, cliente nuevo)", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 4 }],
      { customerType: "nuevo", discountRule, advanceRule, shippingCents: toCents(200) }
    );
    expect(r.subtotalCents).toBe(toCents(2000));
    expect(r.discountApplies).toBe(true);
    expect(r.discountCents).toBe(toCents(400));
    expect(r.productsTotalCents).toBe(toCents(1600));
    expect(r.totalCents).toBe(toCents(1800));
    expect(r.requiresAdvance).toBe(true);
    expect(r.advanceAmountCents).toBe(toCents(800));
    expect(r.balanceDueCents).toBe(toCents(1000));
  });

  it("3 unidades no dispara descuento; 4 sí, aunque sean del mismo producto", () => {
    const three = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 3 }],
      { customerType: "nuevo", discountRule, advanceRule }
    );
    expect(three.discountApplies).toBe(false);
    expect(three.discountCents).toBe(0);

    const four = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 4 }],
      { customerType: "nuevo", discountRule, advanceRule }
    );
    expect(four.discountApplies).toBe(true);
  });

  it("4 unidades repartidas entre productos distintos también dispara el descuento", () => {
    const r = computeCartPricing(
      [
        { unitPriceCents: toCents(300), quantity: 2 },
        { unitPriceCents: toCents(400), quantity: 2 },
      ],
      { customerType: "nuevo", discountRule, advanceRule }
    );
    expect(r.totalQty).toBe(4);
    expect(r.discountApplies).toBe(true);
  });

  it("sin envío cotizado, total y saldo quedan undefined (nunca un total a medias)", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 1 }],
      { customerType: "nuevo", discountRule, advanceRule }
    );
    expect(r.shippingCents).toBeUndefined();
    expect(r.totalCents).toBeUndefined();
    expect(r.balanceDueCents).toBeUndefined();
  });

  it("cliente frecuente sin pedido grande: sin anticipo (pago contra entrega)", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 1 }],
      { customerType: "frecuente", discountRule, advanceRule, shippingCents: toCents(100) }
    );
    expect(r.requiresAdvance).toBe(false);
    expect(r.advanceAmountCents).toBe(0);
    expect(r.balanceDueCents).toBe(r.totalCents);
  });

  it("cliente frecuente CON pedido grande sí requiere anticipo", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(2500), quantity: 1 }], // 2500 > umbral 2000, sin descuento (qty<4)
      { customerType: "frecuente", discountRule, advanceRule }
    );
    expect(r.productsTotalCents).toBeGreaterThanOrEqual(advanceRule.largeOrderThresholdCents);
    expect(r.requiresAdvance).toBe(true);
    expect(r.advanceAmountCents).toBe(toCents(1250));
  });

  it("el umbral de pedido grande es inclusive (exactamente RD$2000 sí requiere anticipo)", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(2000), quantity: 1 }],
      { customerType: "frecuente", discountRule, advanceRule }
    );
    expect(r.productsTotalCents).toBe(toCents(2000));
    expect(r.requiresAdvance).toBe(true);
  });

  it("justo por debajo del umbral (RD$1999.99) no requiere anticipo para cliente frecuente", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(1999.99), quantity: 1 }],
      { customerType: "frecuente", discountRule, advanceRule }
    );
    expect(r.requiresAdvance).toBe(false);
  });

  it("el descuento nunca se aplica al envío", () => {
    const r = computeCartPricing(
      [{ unitPriceCents: toCents(500), quantity: 4 }],
      { customerType: "nuevo", discountRule, advanceRule, shippingCents: toCents(300) }
    );
    // total = productsTotal (con descuento) + envío COMPLETO, sin descuento
    expect(r.totalCents).toBe(r.productsTotalCents + toCents(300));
  });
});
