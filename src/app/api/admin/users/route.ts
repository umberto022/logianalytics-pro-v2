import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const decoded  = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.platformAdmin !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db   = getAdminDb();
    const snap = await db.collection("users").orderBy("createdAt", "desc").get();

    const users = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid:          d.id,
        email:        data.email        as string,
        fullName:     data.fullName     as string,
        companyName:  data.companyName  as string | undefined,
        role:         data.role         as string,
        createdAt:    data.createdAt?.toDate?.()?.toISOString() ?? null,
        lastLogin:    data.lastLogin?.toDate?.()?.toISOString() ?? null,
        onboarding:   data.onboardingCompleted as boolean | undefined,
      };
    });

    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
