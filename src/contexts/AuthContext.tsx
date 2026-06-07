"use client";

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  updateProfile, sendPasswordResetEmail,
  setPersistence, browserSessionPersistence, type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createUserProfile, getUserProfile, touchLastLogin,
} from "@/lib/firestore/users";
import type { UserProfile } from "@/types";

interface AuthCtx {
  user:         User | null;
  profile:      UserProfile | null;
  loading:      boolean;
  signIn:       (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  register:     (email: string, password: string, fullName: string, phone: string) => Promise<void>;
  logout:        () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User) {
    try {
      const p = await getUserProfile(u.uid);
      setProfile(p);
      if (p) touchLastLogin(u.uid).catch(() => {});
    } catch (e) {
      console.error("loadProfile error:", e);
      setProfile(null);
    }
  }

  useEffect(() => {
    // Handle redirect result from Google sign-in on mobile
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const exists = await getUserProfile(result.user.uid).catch(() => null);
        if (!exists) {
          await createUserProfile(result.user.uid, {
            email:    result.user.email!,
            fullName: result.user.displayName ?? "",
          });
        }
      }
    }).catch(console.error);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) await loadProfile(u);
        else    setProfile(null);
      } catch (e) {
        console.error("onAuthStateChanged error:", e);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function signIn(email: string, password: string) {
    await setPersistence(auth, browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await loadProfile(cred.user);
  }

  async function signInGoogle() {
    await setPersistence(auth, browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      await signInWithRedirect(auth, provider);
      return; // page will reload after redirect
    }
    const cred = await signInWithPopup(auth, provider);
    const exists = await getUserProfile(cred.user.uid).catch(() => null);
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
    await setPersistence(auth, browserSessionPersistence);
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

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user);
  }

  return (
    <Ctx.Provider value={{ user, profile, loading, signIn, signInGoogle, register, logout, resetPassword, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
