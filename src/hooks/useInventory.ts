"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";

export const INVENTORY_KEY = (uid: string) => ["inventory", uid];

export function useInventory() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey:  INVENTORY_KEY(user?.uid ?? ""),
    queryFn:   () => listInventory(user!.uid),
    enabled:   !!user,
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
  const { user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: INVENTORY_KEY(user?.uid ?? "") });
}
