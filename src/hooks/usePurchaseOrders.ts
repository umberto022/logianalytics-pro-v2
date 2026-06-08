"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { listPurchaseOrders } from "@/lib/firestore/purchases";

export const PURCHASE_ORDERS_KEY = (uid: string) => ["purchaseOrders", uid];

export function usePurchaseOrders() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: PURCHASE_ORDERS_KEY(user?.uid ?? ""),
    queryFn:  () => listPurchaseOrders(user!.uid),
    enabled:  !!user,
    staleTime: 2 * 60 * 1000,
  });
  return {
    orders:  query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useInvalidatePurchaseOrders() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY(user?.uid ?? "") });
}
