"use client";

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider,
  signInWithPopup, updateProfile, type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createUserProfile, getUserProfile, touchLastLogin,
} from "@/lib/firestore/users";
import type { UserProfile } from "@/types";

interface AuthCtx {
  user:        User | null;
  profile:     UserProfile | null;
  loading:     boolean;
  signIn:      (email: string, password: string) => Promise<void>;
  signInGoogle:() => Promise<void>;
  register:    (email: string, password: string, fullName: string, phone: string) => Promise<void>;
  logout:      () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User) {
    const p = await getUserProfile(u.uid);
    setProfile(p);
    if (p) touchLastLogin(u.uid).catch(() => {});
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await loadProfile(u);
      else    setProfile(null);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await loadProfile(cred.user);
  }

  async function signInGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const exists = await getUserProfile(cred.user.uid);
    if (!exists) {
      await createUserProfile(cred.user.uid, {
        email:    cred.user.email!,
        fullName: cred.user.displayName ?? "",
      });
    }
    await loadProfile(cred.user);
  }

  async function register(
    email: string, password: string, fullName: string, phone: string
  ) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await createUserProfile(cred.user.uid, { email, fullName, phone });
    await loadProfile(cred.user);
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user);
  }

  return (
    <Ctx.Provider value={{ user, profile, loading, signIn, signInGoogle, register, logout, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
