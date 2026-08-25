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
  createUserProfile, getUserProfile, touchLastLogin, backfillWorkspaceId,
} from "@/lib/firestore/users";
import { saveRecentAccount } from "@/lib/recentAccounts";
import type { UserProfile, Department, WorkspaceStatus } from "@/types";

/**
 * Solo UX — la protección real vive en firestore.rules (workspaceIsActive()).
 * El querystring con timestamp no es decorativo: sin él, un cache de borde
 * (Vercel Edge / CDN) puede quedarse pegado a la primera respuesta para esta
 * URL exacta y seguir sirviéndola aunque el estado real ya cambió — pasó en
 * vivo al verificar este flujo, con `cache: "no-store"` puesto y todo. Una
 * URL distinta en cada llamada es lo único que garantiza no pegarle nunca a
 * una entrada de caché vieja, sin depender de que cada capa intermedia
 * respete el header Cache-Control.
 */
async function fetchWorkspaceStatus(u: User): Promise<WorkspaceStatus> {
  const token = await u.getIdToken();
  const res = await fetch(`/api/workspace-status?t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return (data.status as WorkspaceStatus) ?? "active";
}

/** Guarda la cuenta en el selector rápido de /login (ver recentAccounts.ts). */
function rememberAccount(u: User, provider: "password" | "google.com", role?: Department) {
  saveRecentAccount({
    uid:      u.uid,
    email:    u.email ?? "",
    fullName: u.displayName ?? u.email ?? "",
    photoURL: u.photoURL ?? undefined,
    provider,
    role,
  });
}

interface AuthCtx {
  user:         User | null;
  profile:      UserProfile | null;
  loading:      boolean;
  /** null mientras se resuelve o si no hay sesión — tratar como "no bloquear todavía". */
  workspaceStatus: WorkspaceStatus | null;
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
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);

  async function loadProfile(u: User): Promise<UserProfile | null> {
    try {
      let p = await getUserProfile(u.uid);
      if (p && !p.workspaceId) {
        await backfillWorkspaceId(u.uid).catch(() => {});
        p = { ...p, workspaceId: u.uid };
      }
      setProfile(p);
      if (p) touchLastLogin(u.uid).catch(() => {});
      if (p) {
        // Se espera acá (no fire-and-forget) para que `loading` no baje a false
        // hasta tener el estado — evita un parpadeo de la app normal antes de
        // mostrar la pantalla de bloqueo a una cuenta pendiente/suspendida.
        const status = await fetchWorkspaceStatus(u).catch(() => "active" as WorkspaceStatus);
        setWorkspaceStatus(status);
      } else {
        setWorkspaceStatus(null);
      }
      return p;
    } catch (e) {
      console.error("loadProfile error:", e);
      setProfile(null);
      return null;
    }
  }

  useEffect(() => {
    // Handle redirect result from Google sign-in on mobile
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const exists = await getUserProfile(result.user.uid).catch(() => null);
        let role = exists?.role;
        if (!exists) {
          await createUserProfile(result.user.uid, {
            email:    result.user.email!,
            fullName: result.user.displayName ?? "",
          });
          role = "admin"; // createUserProfile siempre da de alta como admin de un workspace nuevo
        }
        rememberAccount(result.user, "google.com", role);
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
    const p = await loadProfile(cred.user);
    rememberAccount(cred.user, "password", p?.role);
  }

  async function signInGoogle() {
    try {
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
      const p = await loadProfile(cred.user);
      rememberAccount(cred.user, "google.com", p?.role);
    } catch (e) {
      // Callers only show a generic toast — log the real Firebase error code
      // (e.g. auth/operation-not-allowed, auth/popup-blocked, auth/unauthorized-domain)
      // so it's diagnosable from the browser console instead of guessing.
      console.error("signInGoogle error:", e);
      throw e;
    }
  }

  async function register(
    email: string, password: string, fullName: string, phone: string
  ) {
    await setPersistence(auth, browserSessionPersistence);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await createUserProfile(cred.user.uid, { email, fullName, phone });
    await loadProfile(cred.user);
    // createUserProfile siempre da de alta como admin de un workspace nuevo.
    saveRecentAccount({ uid: cred.user.uid, email, fullName, provider: "password", role: "admin" });
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setWorkspaceStatus(null);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user);
  }

  return (
    <Ctx.Provider value={{ user, profile, loading, workspaceStatus, signIn, signInGoogle, register, logout, resetPassword, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
