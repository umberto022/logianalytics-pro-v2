import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { getStockStatus } from "@/lib/utils";
import { isPushEnabled, sendStockNotification } from "@/lib/notifications";
import { getCurrentFcmToken } from "@/lib/fcm";
import type { InventoryItem } from "@/types";

// Fans the alert out to every device registered for the workspace via FCM (see the route for
// why: this tab already showed a local Notification, so it excludes itself). Best-effort —
// notifications are a nice-to-have, never worth surfacing an error toast over.
async function pushToWorkspace(item: InventoryItem) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const [idToken, excludeToken] = await Promise.all([user.getIdToken(), getCurrentFcmToken()]);
    await fetch("/api/notify-stock-critical", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        itemName: item.name,
        currentStock: item.currentStock,
        minStock: item.minStock,
        excludeToken,
      }),
    });
  } catch (e) {
    console.error("pushToWorkspace error:", e);
  }
}

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
            pushToWorkspace(item);
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
