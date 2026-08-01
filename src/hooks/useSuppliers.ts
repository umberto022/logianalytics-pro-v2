"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listSuppliers } from "@/lib/firestore/suppliers";

export const SUPPLIERS_KEY = (uid: string) => ["suppliers", uid];

export function useSuppliers() {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: SUPPLIERS_KEY(workspaceId),
    queryFn:  () => listSuppliers(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
  return {
    suppliers: query.data ?? [],
    loading:   query.isLoading,
    refetch:   query.refetch,
  };
}

export function useInvalidateSuppliers() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SUPPLIERS_KEY(workspaceId) });
}
