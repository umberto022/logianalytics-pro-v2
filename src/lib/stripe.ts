export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    limits: {
      products: 50,
      canExportPDF: false,
      canExportCSV: true,
      canViewRentabilidad: false,
      canViewRutas: false,
    },
  },
  pro: {
    name: "Pro",
    price: 19,
    limits: {
      products: Infinity,
      canExportPDF: true,
      canExportCSV: true,
      canViewRentabilidad: true,
      canViewRutas: true,
    },
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// Redirige al Stripe Payment Link configurado en env vars.
// En el dashboard de Stripe: Products → Payment Links → Create link
// Pasar ?client_reference_id=<userId>&prefilled_email=<email> para tracking.
export function getStripeCheckoutUrl(userId: string, userEmail: string): string | null {
  const link = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
  if (!link) return null;
  const url = new URL(link);
  url.searchParams.set("client_reference_id", userId);
  url.searchParams.set("prefilled_email", userEmail);
  return url.toString();
}
