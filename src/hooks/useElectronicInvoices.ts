"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { listInvoices } from "@/lib/firestore/einvoicing";

export const EINVOICES_KEY = (uid: string) => ["electronicInvoices", uid];

export function useElectronicInvoices() {
  const { workspaceId } = useRole();
  const query = useQuery({
    queryKey: EINVOICES_KEY(workspaceId),
    queryFn:  () => listInvoices(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 30 * 1000, // los estados cambian seguido (borrador → enviado → aceptado)
  });
  return {
    invoices: query.data ?? [],
    loading:  query.isLoading,
    refetch:  query.refetch,
  };
}

export function useInvalidateElectronicInvoices() {
  const { workspaceId } = useRole();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: EINVOICES_KEY(workspaceId) });
}
