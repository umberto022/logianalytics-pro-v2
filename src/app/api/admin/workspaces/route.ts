import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

const ACTIONS = ["approve", "suspend", "reactivate", "cancel", "markPaid", "markDue"] as const;
type Action = (typeof ACTIONS)[number];

async function requirePlatformAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const decoded  = await getAdminAuth().verifyIdToken(token);
  const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userSnap.exists || userSnap.data()?.platformAdmin !== true) return null;
  return decoded.uid;
}

// Cada "empresa" es el doc de un Admin que es dueño de su propio workspace
// (role === 'admin' && workspaceId === su propio uid) — los empleados invitados
// comparten ese mismo workspaceId pero no tienen doc propio de estado/pago.
export async function GET(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const snap = await getAdminDb().collection("users").where("role", "==", "admin").orderBy("createdAt", "desc").get();
    const workspaces = snap.docs
      .filter((d) => d.data().workspaceId === d.id)
      .map((d) => {
        const data = d.data();
        return {
          workspaceId:     d.id,
          companyName:     (data.companyName as string | undefined) ?? "",
          adminName:       data.fullName as string,
          adminEmail:      data.email as string,
          workspaceStatus: (data.workspaceStatus as string | undefined) ?? "active",
          paymentStatus:   (data.paymentStatus as string | undefined) ?? "current",
          nextPaymentDate: (data.nextPaymentDate as string | undefined) ?? null,
          billingNotes:    (data.billingNotes as string | undefined) ?? "",
          createdAt:       data.createdAt?.toDate?.()?.toISOString() ?? null,
          approvedAt:      data.approvedAt?.toDate?.()?.toISOString() ?? null,
        };
      });

    return NextResponse.json({ workspaces });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { workspaceId, action, nextPaymentDate, billingNotes } = body as {
      workspaceId?: string; action?: Action; nextPaymentDate?: string; billingNotes?: string;
    };
    if (!workspaceId || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const db  = getAdminDb();
    const ref = db.collection("users").doc(workspaceId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (action === "approve")    { patch.workspaceStatus = "active";    patch.approvedAt = new Date(); }
    if (action === "suspend")    { patch.workspaceStatus = "suspended"; }
    if (action === "reactivate") { patch.workspaceStatus = "active";    }
    if (action === "cancel")     { patch.workspaceStatus = "cancelled"; }
    if (action === "markPaid")   { patch.paymentStatus   = "current";   }
    if (action === "markDue")    { patch.paymentStatus   = "due";       }
    if (nextPaymentDate !== undefined) patch.nextPaymentDate = nextPaymentDate;
    if (billingNotes    !== undefined) patch.billingNotes    = billingNotes;

    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
