import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/noStoreJson";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import type { Department } from "@/types";

export const dynamic = "force-dynamic";

const DEPARTMENTS: Department[] = ["admin", "ventas", "compras", "logistica"];

async function requireCompanyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const decoded  = await getAdminAuth().verifyIdToken(token);
  const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userSnap.exists || userSnap.data()?.role !== "admin") return null;
  return decoded.uid; // == workspaceId for this admin's own workspace
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await requireCompanyAdmin(req);
    if (!workspaceId) return noStoreJson({ error: "Forbidden" }, { status: 403 });

    const snap = await getAdminDb()
      .collection("users")
      .where("workspaceId", "==", workspaceId)
      .get();

    const employees = snap.docs
      .filter((d) => d.id !== workspaceId)
      .map((d) => {
        const data = d.data();
        return {
          uid:       d.id,
          email:     data.email as string,
          fullName:  data.fullName as string,
          role:      data.role as Department,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          lastLogin: data.lastLogin?.toDate?.()?.toISOString() ?? null,
        };
      });

    return noStoreJson({ employees });
  } catch (e) {
    return noStoreJson({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await requireCompanyAdmin(req);
    if (!workspaceId) return noStoreJson({ error: "Forbidden" }, { status: 403 });

    const { email, password, fullName, role } = await req.json();
    if (!email || !password || !fullName || !role) {
      return noStoreJson({ error: "Faltan datos" }, { status: 400 });
    }
    if (!DEPARTMENTS.includes(role)) {
      return noStoreJson({ error: "Área inválida" }, { status: 400 });
    }
    if (password.length < 6) {
      return noStoreJson({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const userRecord = await getAdminAuth().createUser({ email, password, displayName: fullName });

    await getAdminDb().collection("users").doc(userRecord.uid).set({
      email,
      fullName,
      phone: "",
      role,
      workspaceId,
      subscriptionPlan: "free",
      onboardingCompleted: true,
      createdAt: new Date(),
    });

    return noStoreJson({ ok: true, uid: userRecord.uid });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    const message = code === "auth/email-already-exists"
      ? "Ese email ya está registrado"
      : e instanceof Error ? e.message : "Error desconocido";
    return noStoreJson({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const workspaceId = await requireCompanyAdmin(req);
    if (!workspaceId) return noStoreJson({ error: "Forbidden" }, { status: 403 });

    const { uid, role } = await req.json();
    if (!uid || !role || !DEPARTMENTS.includes(role)) {
      return noStoreJson({ error: "Datos inválidos" }, { status: 400 });
    }

    const db = getAdminDb();
    const targetSnap = await db.collection("users").doc(uid).get();
    if (!targetSnap.exists || targetSnap.data()?.workspaceId !== workspaceId) {
      return noStoreJson({ error: "Usuario no encontrado en tu empresa" }, { status: 404 });
    }

    await db.collection("users").doc(uid).update({ role });
    return noStoreJson({ ok: true });
  } catch (e) {
    return noStoreJson({ error: String(e) }, { status: 500 });
  }
}
