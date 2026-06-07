"use client";

export function usePlan() {
  return {
    planKey:             "pro" as const,
    planName:            "Pro",
    isPro:               true,
    isFree:              false,
    limits:              { products: Infinity, canExportPDF: true, canViewRentabilidad: true, canViewRutas: true },
    canAddProduct:       (_count: number) => true,
    productLimitReached: (_count: number) => false,
  };
}
