"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getSales } from "@/lib/firestore/sales";
import type { Period } from "@/types";

export const SALES_KEY = (uid: string, period: Period) => ["sales", uid, period];

export function useSales(period: Period) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey:  SALES_KEY(user?.uid ?? "", period),
    queryFn:   () => getSales(user!.uid, period),
    enabled:   !!user,
    staleTime: 60 * 1000,
  });

  return {
    sales:   query.data ?? [],
    loading: query.isLoading,
    error:   query.error,
    refetch: query.refetch,
  };
}

export function useInvalidateSales() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["sales", user?.uid ?? ""] });
}
