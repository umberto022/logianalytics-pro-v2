"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { listSuppliers } from "@/lib/firestore/suppliers";

export const SUPPLIERS_KEY = (uid: string) => ["suppliers", uid];

export function useSuppliers() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: SUPPLIERS_KEY(user?.uid ?? ""),
    queryFn:  () => listSuppliers(user!.uid),
    enabled:  !!user,
    staleTime: 2 * 60 * 1000,
  });
  return {
    suppliers: query.data ?? [],
    loading:   query.isLoading,
    refetch:   query.refetch,
  };
}

export function useInvalidateSuppliers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SUPPLIERS_KEY(user?.uid ?? "") });
}
