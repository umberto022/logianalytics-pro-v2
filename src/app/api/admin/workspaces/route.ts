import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/noStoreJson";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

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
  if (!(await requirePlatformAdmin(req))) return noStoreJson({ error: "Forbidden" }, { status: 403 });

  try {
    // Sin orderBy acá a propósito: where('role','==','admin') + orderBy('createdAt')
    // es una query compuesta que Firestore rechaza (FAILED_PRECONDITION) sin un
    // índice creado a mano — pasó en vivo, la ruta fallaba en silencio (el
    // frontend solo pinta la lista si `data.workspaces` existe) y el panel
    // mostraba "Empresas (0)" sin ningún error visible. Se ordena en memoria en
    // su lugar — a esta escala (decenas/cientos de empresas admin, no millones)
    // no hace falta el índice para nada.
    const snap = await getAdminDb().collection("users").where("role", "==", "admin").get();
    const workspaces = snap.docs
      // Solo empresas reales — las cuentas de operador de plataforma
      // (platformOnly, ver (app)/layout.tsx) no son un cliente a gestionar acá.
      .filter((d) => d.data().workspaceId === d.id && d.data().platformOnly !== true)
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
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return noStoreJson({ workspaces });
  } catch (e) {
    return noStoreJson({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return noStoreJson({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { workspaceId, action, nextPaymentDate, billingNotes } = body as {
      workspaceId?: string; action?: Action; nextPaymentDate?: string; billingNotes?: string;
    };
    if (!workspaceId || !action || !ACTIONS.includes(action)) {
      return noStoreJson({ error: "Datos inválidos" }, { status: 400 });
    }

    const db  = getAdminDb();
    const ref = db.collection("users").doc(workspaceId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.workspaceId !== workspaceId) {
      return noStoreJson({ error: "Empresa no encontrada" }, { status: 404 });
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
    return noStoreJson({ ok: true });
  } catch (e) {
    return noStoreJson({ error: String(e) }, { status: 500 });
  }
}
