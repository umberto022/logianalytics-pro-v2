import {
  doc, getDoc, setDoc, updateDoc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

const userDoc = (uid: string) => doc(db, "users", uid);

export async function createUserProfile(
  uid: string,
  data: { email: string; fullName: string; phone?: string }
): Promise<void> {
  await setDoc(userDoc(uid), {
    email:            data.email,
    fullName:         data.fullName,
    phone:            data.phone ?? "",
    role:             "user",
    subscriptionPlan: "free",
    createdAt:        Timestamp.now(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userDoc(uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as UserProfile;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "fullName" | "phone" | "companyId" | "companyName">>
): Promise<void> {
  await updateDoc(userDoc(uid), data);
}

export async function touchLastLogin(uid: string): Promise<void> {
  await updateDoc(userDoc(uid), { lastLogin: Timestamp.now() });
}
