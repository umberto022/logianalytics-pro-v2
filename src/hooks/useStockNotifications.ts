import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getStockStatus } from "@/lib/utils";
import { isPushEnabled, sendStockNotification } from "@/lib/notifications";
import type { InventoryItem } from "@/types";

export function useStockNotifications() {
  const { user } = useAuth();
  // Track which items we've already notified so we don't spam on every render
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const col = collection(db, "inventory", user.uid, "items");

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
  }, [user]);
}
