"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listRawMaterials } from "@/lib/firestore/rawMaterials";

export const RAW_MATERIALS_KEY = (workspaceId: string) => ["rawMaterials", workspaceId];

export function useRawMaterials() {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: RAW_MATERIALS_KEY(workspaceId),
    queryFn:  () => listRawMaterials(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
  return {
    rawMaterials: query.data ?? [],
    loading:      query.isLoading,
    refetch:      query.refetch,
  };
}

export function useInvalidateRawMaterials() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: RAW_MATERIALS_KEY(workspaceId) });
}
