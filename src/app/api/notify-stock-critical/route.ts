import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth, getAdminMessaging } from "@/lib/firebase-admin";
import { canViewModule } from "@/lib/permissions";
import type { Department } from "@/types";

// Called by useStockNotifications.ts the moment a product first crosses into "crítico" in
// whichever browser tab has the Firestore listener open. That tab already shows its own
// instant local Notification (see src/lib/notifications.ts) — this route's job is to reach
// every OTHER registered device for the workspace via a real FCM push, so a teammate whose
// app is backgrounded (or fully closed) finds out too, not just whoever's tab was open.
// Requires a Firebase ID token in the Authorization header.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const callerDoc = await db.collection("users").doc(decoded.uid).get();
    if (!callerDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const callerProfile = callerDoc.data()!;
    const workspaceId = (callerProfile.workspaceId as string | undefined) ?? decoded.uid;

    const { itemName, currentStock, minStock, excludeToken } = (await req.json()) as {
      itemName: string;
      currentStock: number;
      minStock: number;
      excludeToken?: string;
    };
    if (!itemName) return NextResponse.json({ error: "Missing itemName" }, { status: 400 });

    // Recipients: same audience the existing Web Notification already reaches (whoever can
    // view Inventario — admin, logística, and ventas read-only), just fanned out to every
    // device they've granted push permission on, not only the tab that detected the change.
    const membersSnap = await db.collection("users").where("workspaceId", "==", workspaceId).get();

    const tokenOwners = new Map<string, FirebaseFirestore.DocumentReference>();
    membersSnap.docs.forEach((d) => {
      const p = d.data();
      const role = p.role as Department | undefined;
      if (!role || !canViewModule(role, "inventario")) return;
      (p.fcmTokens as string[] | undefined)?.forEach((t) => {
        if (t !== excludeToken) tokenOwners.set(t, d.ref);
      });
    });
    // Defensive fallback: legacy user docs that predate the `workspaceId` self-heal won't
    // match the query above even for the caller themselves — never drop the caller's own devices.
    if (!tokenOwners.size && callerProfile.workspaceId === undefined) {
      (callerProfile.fcmTokens as string[] | undefined)?.forEach((t) => {
        if (t !== excludeToken) tokenOwners.set(t, callerDoc.ref);
      });
    }

    if (tokenOwners.size === 0) return NextResponse.json({ sent: 0 });

    const tokens = Array.from(tokenOwners.keys());
    const res = await getAdminMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "⚠️ Stock crítico — LogiAnalytics Pro",
        body: `${itemName}: ${currentStock} uds (mín. ${minStock})`,
      },
      data: { tag: `stock-${itemName}` },
    });

    // Prune tokens FCM reports as permanently dead (app uninstalled, permission revoked, etc.)
    // so the array doesn't grow forever with sends that will never succeed.
    const deadByOwner = new Map<FirebaseFirestore.DocumentReference, string[]>();
    res.responses.forEach((r, i) => {
      if (r.success || r.error?.code !== "messaging/registration-token-not-registered") return;
      const owner = tokenOwners.get(tokens[i])!;
      deadByOwner.set(owner, [...(deadByOwner.get(owner) ?? []), tokens[i]]);
    });
    await Promise.all(
      Array.from(deadByOwner.entries()).map(([ref, dead]) =>
        ref.update({ fcmTokens: FieldValue.arrayRemove(...dead) })
      )
    );

    return NextResponse.json({ sent: res.successCount, failed: res.failureCount });
  } catch (e) {
    console.error("notify-stock-critical error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
