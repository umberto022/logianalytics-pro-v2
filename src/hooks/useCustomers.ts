"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listCustomers } from "@/lib/firestore/customers";

export const CUSTOMERS_KEY = (uid: string) => ["customers", uid];

export function useCustomers() {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: CUSTOMERS_KEY(workspaceId),
    queryFn:  () => listCustomers(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
  return {
    customers: query.data ?? [],
    loading:   query.isLoading,
    error:     query.error,
    refetch:   query.refetch,
  };
}

export function useInvalidateCustomers() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY(workspaceId) });
}
