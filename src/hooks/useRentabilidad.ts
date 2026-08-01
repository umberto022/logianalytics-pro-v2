"use client";

import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { getSales, getSalesByRange } from "@/lib/firestore/sales";
import { listMovements, listMovementsByRange } from "@/lib/firestore/inventory";
import type { Period } from "@/types";

type DateMode = "preset" | "custom";

export function useRentabilidad(
  mode: DateMode,
  period: Period,
  fromDate: string,
  toDate: string
) {
  const { workspaceId } = useRole();

  const queryKey = ["rentabilidad", workspaceId, mode, mode === "preset" ? period : `${fromDate}_${toDate}`];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return { sales: [], movements: [] };
      if (mode === "custom") {
        const from = new Date(fromDate + "T00:00:00");
        const to   = new Date(toDate   + "T23:59:59");
        const [sales, movements] = await Promise.all([
          getSalesByRange(workspaceId, from, to),
          listMovementsByRange(workspaceId, from, to),
        ]);
        return { sales, movements };
      } else {
        const [sales, movements] = await Promise.all([
          getSales(workspaceId, period),
          listMovements(workspaceId, period),
        ]);
        return { sales, movements };
      }
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });

  return {
    sales:     query.data?.sales ?? [],
    movements: query.data?.movements ?? [],
    loading:   query.isLoading,
    refetch:   query.refetch,
  };
}
