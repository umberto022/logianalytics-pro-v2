import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import type { Department } from "@/types";

const DEPARTMENTS: Department[] = ["admin", "ventas", "compras", "logistica"];

// Mismo patrón que /api/admin/employees (que usa "Mi Equipo" para que una
// empresa gestione a su propio personal) pero gateado por platformAdmin en
// vez de "sos el admin de tu propia empresa" — así el operador de la
// plataforma puede gestionar el equipo de CUALQUIER empresa, sin tener que
// loguearse como ella. El workspaceId objetivo viaja explícito en cada
// request (querystring en GET, body en POST/PATCH), a diferencia de
// /api/admin/employees donde el workspaceId sale del propio caller.
async function requirePlatformAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const decoded  = await getAdminAuth().verifyIdToken(token);
  const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
  return userSnap.exists && userSnap.data()?.platformAdmin === true;
}

export async function GET(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Falta workspaceId" }, { status: 400 });

  try {
    const snap = await getAdminDb().collection("users").where("workspaceId", "==", workspaceId).get();
    const employees = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid:       d.id,
        email:     data.email as string,
        fullName:  data.fullName as string,
        role:      data.role as Department,
        isOwner:   d.id === workspaceId,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        lastLogin: data.lastLogin?.toDate?.()?.toISOString() ?? null,
      };
    });
    return NextResponse.json({ employees });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { workspaceId, email, password, fullName, role } = await req.json();
    if (!workspaceId || !email || !password || !fullName || !role) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    if (!DEPARTMENTS.includes(role)) {
      return NextResponse.json({ error: "Área inválida" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const db = getAdminDb();
    const wsSnap = await db.collection("users").doc(workspaceId).get();
    if (!wsSnap.exists || wsSnap.data()?.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const userRecord = await getAdminAuth().createUser({ email, password, displayName: fullName });

    await db.collection("users").doc(userRecord.uid).set({
      email,
      fullName,
      phone: "",
      role,
      workspaceId,
      subscriptionPlan: "free",
      onboardingCompleted: true,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, uid: userRecord.uid });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    const message = code === "auth/email-already-exists"
      ? "Ese email ya está registrado"
      : e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requirePlatformAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { uid, role } = await req.json();
    if (!uid || !role || !DEPARTMENTS.includes(role)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const db = getAdminDb();
    const targetSnap = await db.collection("users").doc(uid).get();
    if (!targetSnap.exists) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    await db.collection("users").doc(uid).update({ role });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
