"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listInventory } from "@/lib/firestore/inventory";

export const INVENTORY_KEY = (uid: string) => ["inventory", uid];

export function useInventory(enabled: boolean = true) {
  const { workspaceId } = useRole();

  const query = useQuery({
    queryKey:  INVENTORY_KEY(workspaceId),
    queryFn:   () => listInventory(workspaceId),
    enabled:   !!workspaceId && enabled,
    staleTime: 60 * 1000,
  });

  return {
    items:   query.data ?? [],
    loading: query.isLoading,
    error:   query.error,
    refetch: query.refetch,
  };
}

/** Invalida el caché de inventario desde cualquier componente tras una mutación */
export function useInvalidateInventory() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: INVENTORY_KEY(workspaceId) });
}
