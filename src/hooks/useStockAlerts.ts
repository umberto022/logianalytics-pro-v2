import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listInventory } from "@/lib/firestore/inventory";
import { getStockStatus } from "@/lib/utils";

export function useStockAlerts() {
  const { user } = useAuth();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    listInventory(user.uid).then((items) => {
      setCriticalCount(items.filter((i) => getStockStatus(i) === "critical").length);
    });
  }, [user]);

  return criticalCount;
}
