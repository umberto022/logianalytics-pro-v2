import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

async function getAdminUid(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded  = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return null;
    return userSnap.data()?.platformAdmin === true ? decoded.uid : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const adminUid = await getAdminUid(req);
  if (!adminUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const db = getAdminDb();
    // Sin orderBy acá a propósito: collectionGroup(...).orderBy(...) exige un
    // índice de collection group que nunca se creó — la ruta fallaba en
    // silencio hasta que se agregó el toast de error en admin/page.tsx, que
    // fue lo que lo destapó. Se ordena en memoria en su lugar, mismo patrón
    // que /api/admin/workspaces.
    const snap = await db.collectionGroup("reports").get();

    const items = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id:        d.id,
          uid:       d.ref.parent.parent?.id ?? "",
          type:      data.type      as string,
          message:   data.message   as string,
          userEmail: data.userEmail as string,
          userName:  data.userName  as string,
          page:      data.page      as string,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 200);

    return NextResponse.json({ items });
  } catch (e) {
    console.error("Admin feedback error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminUid = await getAdminUid(req);
  if (!adminUid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { uid, id } = await req.json() as { uid: string; id: string };
  if (!uid || !id) return NextResponse.json({ error: "Missing uid or id" }, { status: 400 });

  try {
    await getAdminDb().collection("feedback").doc(uid).collection("reports").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
