import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { getStockStatus } from "@/lib/utils";
import { isPushEnabled, sendStockNotification } from "@/lib/notifications";
import type { InventoryItem } from "@/types";

export function useStockNotifications() {
  const { workspaceId, can } = useRole();
  // Track which items we've already notified so we don't spam on every render
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId || !can("inventario").canView) return;

    const col = collection(db, "inventory", workspaceId, "items");

    const unsub = onSnapshot(col, (snap) => {
      if (!isPushEnabled()) return;

      snap.docChanges().forEach((change) => {
        if (change.type !== "added" && change.type !== "modified") return;

        const item = { id: change.doc.id, ...change.doc.data() } as InventoryItem;
        const status = getStockStatus(item);

        if (status === "critical") {
          if (!notifiedRef.current.has(item.id)) {
            notifiedRef.current.add(item.id);
            sendStockNotification(item.name, item.currentStock, item.minStock);
          }
        } else {
          // Stock recovered — allow notifying again if it drops again
          notifiedRef.current.delete(item.id);
        }
      });
    });

    return () => unsub();
  }, [workspaceId, can]);
}
