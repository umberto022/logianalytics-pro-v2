"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listPurchaseOrders } from "@/lib/firestore/purchases";

export const PURCHASE_ORDERS_KEY = (uid: string) => ["purchaseOrders", uid];

export function usePurchaseOrders(enabled: boolean = true) {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: PURCHASE_ORDERS_KEY(workspaceId),
    queryFn:  () => listPurchaseOrders(workspaceId),
    enabled:  !!workspaceId && enabled,
    staleTime: 2 * 60 * 1000,
  });
  return {
    orders:  query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useInvalidatePurchaseOrders() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY(workspaceId) });
}
