import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/noStoreJson";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return noStoreJson({ error: "Forbidden" }, { status: 403 });

  try {
    const decoded  = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.platformAdmin !== true) {
      return noStoreJson({ error: "Forbidden" }, { status: 403 });
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

    return noStoreJson({ users });
  } catch (e) {
    return noStoreJson({ error: String(e) }, { status: 500 });
  }
}
