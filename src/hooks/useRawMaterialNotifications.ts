import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { isPushEnabled, sendStockNotification } from "@/lib/notifications";
import { getCurrentFcmToken } from "@/lib/fcm";
import type { RawMaterial } from "@/types";

// Mismo patrón que useStockNotifications.ts pero para insumos — como Insumos es admin-only,
// esto en la práctica solo llega a los otros dispositivos de la propia dueña, no "al equipo".
async function pushToWorkspace(item: RawMaterial) {
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
        module: "insumos",
      }),
    });
  } catch (e) {
    console.error("pushToWorkspace (insumos) error:", e);
  }
}

export function useRawMaterialNotifications() {
  const { workspaceId, can } = useRole();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId || !can("insumos").canView) return;

    const col = collection(db, "users", workspaceId, "rawMaterials");

    const unsub = onSnapshot(col, (snap) => {
      if (!isPushEnabled()) return;

      snap.docChanges().forEach((change) => {
        if (change.type !== "added" && change.type !== "modified") return;

        const item = { id: change.doc.id, ...change.doc.data() } as RawMaterial;
        const critical = item.currentStock <= item.minStock;

        if (critical) {
          if (!notifiedRef.current.has(item.id)) {
            notifiedRef.current.add(item.id);
            sendStockNotification(item.name, item.currentStock, item.minStock);
            pushToWorkspace(item);
          }
        } else {
          // Stock recuperado — permite volver a notificar si vuelve a caer.
          notifiedRef.current.delete(item.id);
        }
      });
    });

    return () => unsub();
  }, [workspaceId, can]);
}
