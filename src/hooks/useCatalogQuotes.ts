"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listQuotes } from "@/lib/firestore/catalogQuotes";

export const CATALOG_QUOTES_KEY = (uid: string) => ["catalogQuotes", uid];

export function useCatalogQuotes() {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: CATALOG_QUOTES_KEY(workspaceId),
    queryFn:  () => listQuotes(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 30 * 1000,
  });
  return { quotes: query.data ?? [], loading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function useInvalidateCatalogQuotes() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CATALOG_QUOTES_KEY(workspaceId) });
}
