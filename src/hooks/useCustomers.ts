"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { listCustomers } from "@/lib/firestore/customers";

export const CUSTOMERS_KEY = (uid: string) => ["customers", uid];

export function useCustomers() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: CUSTOMERS_KEY(user?.uid ?? ""),
    queryFn:  () => listCustomers(user!.uid),
    enabled:  !!user,
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
  const { user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY(user?.uid ?? "") });
}
