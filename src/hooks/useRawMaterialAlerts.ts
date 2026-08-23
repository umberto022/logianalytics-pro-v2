import { useEffect, useState } from "react";
import { useRole } from "@/hooks/useRole";
import { listRawMaterials } from "@/lib/firestore/rawMaterials";

/** Cuenta insumos en stock crítico (currentStock <= minStock), para el badge de Insumos en el nav. */
export function useRawMaterialAlerts() {
  const { workspaceId, can } = useRole();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!workspaceId || !can("insumos").canView) return;
    listRawMaterials(workspaceId).then((items) => {
      setCriticalCount(items.filter((rm) => rm.currentStock <= rm.minStock).length);
    });
  }, [workspaceId, can]);

  return criticalCount;
}
