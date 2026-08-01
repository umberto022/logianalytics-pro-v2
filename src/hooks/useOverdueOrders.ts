"use client";

import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { isPushEnabled } from "@/lib/notifications";
import type { PurchaseOrder } from "@/types";

export function useOverdueOrders() {
  const { workspaceId, can } = useRole();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId || (!can("compras").canView && !can("recepciones").canView)) return;

    const col = collection(db, "purchaseOrders", workspaceId, "orders");

    const unsub = onSnapshot(col, (snap) => {
      if (!isPushEnabled()) return;

      const now = Date.now() / 1000;

      snap.docs.forEach((d) => {
        const order = { id: d.id, ...d.data() } as PurchaseOrder;
        if (order.status !== "pendiente" && order.status !== "parcial") return;

        const isOverdue = order.expectedDate.seconds < now;
        if (isOverdue && !notifiedRef.current.has(order.id)) {
          notifiedRef.current.add(order.id);
          if (Notification.permission === "granted") {
            new Notification("⚠️ Orden de compra vencida", {
              body: `OC ${order.orderNumber} de ${order.supplierName} venció sin recibirse.`,
              icon: "/icons/icon-192.png",
            });
          }
        } else if (!isOverdue) {
          notifiedRef.current.delete(order.id);
        }
      });
    });

    return () => unsub();
  }, [workspaceId, can]);
}

