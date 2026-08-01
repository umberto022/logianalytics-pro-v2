import { useEffect, useState } from "react";
import { useRole } from "@/hooks/useRole";
import { listInventory } from "@/lib/firestore/inventory";
import { getStockStatus } from "@/lib/utils";

export function useStockAlerts() {
  const { workspaceId, can } = useRole();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!workspaceId || !can("inventario").canView) return;
    listInventory(workspaceId).then((items) => {
      setCriticalCount(items.filter((i) => getStockStatus(i) === "critical").length);
    });
  }, [workspaceId, can]);

  return criticalCount;
}
