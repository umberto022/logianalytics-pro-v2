"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user } = useAuth();

  const queryKey = ["rentabilidad", user?.uid ?? "", mode, mode === "preset" ? period : `${fromDate}_${toDate}`];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return { sales: [], movements: [] };
      if (mode === "custom") {
        const from = new Date(fromDate + "T00:00:00");
        const to   = new Date(toDate   + "T23:59:59");
        const [sales, movements] = await Promise.all([
          getSalesByRange(user.uid, from, to),
          listMovementsByRange(user.uid, from, to),
        ]);
        return { sales, movements };
      } else {
        const [sales, movements] = await Promise.all([
          getSales(user.uid, period),
          listMovements(user.uid, period),
        ]);
        return { sales, movements };
      }
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  return {
    sales:     query.data?.sales ?? [],
    movements: query.data?.movements ?? [],
    loading:   query.isLoading,
    refetch:   query.refetch,
  };
}
