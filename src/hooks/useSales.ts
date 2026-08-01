"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { getSales } from "@/lib/firestore/sales";
import type { Period } from "@/types";

export const SALES_KEY = (uid: string, period: Period) => ["sales", uid, period];

export function useSales(period: Period, enabled: boolean = true) {
  const { workspaceId } = useRole();

  const query = useQuery({
    queryKey:  SALES_KEY(workspaceId, period),
    queryFn:   () => getSales(workspaceId, period),
    enabled:   !!workspaceId && enabled,
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
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["sales", workspaceId] });
}
