"use client";

import { useAuth } from "@/contexts/AuthContext";
import { PLANS, type PlanKey } from "@/lib/stripe";

export function usePlan() {
  const { profile } = useAuth();
  const planKey = (profile?.subscriptionPlan ?? "free") as PlanKey;
  const plan    = PLANS[planKey] ?? PLANS.free;

  return {
    planKey,
    planName:            plan.name,
    isPro:               planKey === "pro",
    isFree:              planKey === "free",
    limits:              plan.limits,
    canAddProduct:       (count: number) => count < plan.limits.products,
    productLimitReached: (count: number) => count >= plan.limits.products,
  };
}
