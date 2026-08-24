"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, Eye, EyeOff, X, Plus, Search, Loader2 } from "lucide-react";
import { getRecentAccounts, removeRecentAccount, type RecentAccount } from "@/lib/recentAccounts";
import type { Department } from "@/types";
import { CONTACT_EMAIL } from "@/lib/legal";

const ROLE_BADGE: Record<Department, { label: string; cls: string; ring: string; grad: string }> = {
  admin:     { label: "Admin",      cls: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",     ring: "ring-brand-300 dark:ring-brand-500/60",     grad: "from-brand-400 to-brand-600" },
  ventas:    { label: "Ventas",     cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", ring: "ring-emerald-300 dark:ring-emerald-500/60", grad: "from-emerald-400 to-emerald-600" },
  compras:   { label: "Compras",    cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",     ring: "ring-amber-300 dark:ring-amber-500/60",     grad: "from-amber-400 to-orange-500" },
  logistica: { label: "Logística",  cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",             ring: "ring-sky-300 dark:ring-sky-500/60",         grad: "from-sky-400 to-blue-600" },
};
const DEFAULT_AVATAR_GRAD = "from-fuchsia-400 to-brand-600";
const DEFAULT_AVATAR_RING = "ring-white dark:ring-slate-700";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, signInGoogle, resetPassword, user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [user, authLoading, router]);

  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent,     setResetSent]     = useState(false);
  const [resetLoading,  setResetLoading]  = useState(false);

  // Selector rápido de cuentas ya usadas en este dispositivo (tipo Facebook/Google).
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [manualMode,     setManualMode]     = useState(false);
  const [quickLoadingUid, setQuickLoadingUid] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentAccounts(getRecentAccounts());
  }, []);

  async function handleQuickAccount(acc: RecentAccount) {
    if (quickLoadingUid) return; // ya hay un login rápido en curso
    if (acc.provider === "google.com") {
      setQuickLoadingUid(acc.uid);
      try {
        await handleGoogle();
      } finally {
        setQuickLoadingUid(null);
      }
      return;
    }
    // Cuenta de email/contraseña: nunca guardamos la contraseña — solo
    // precargamos el email y le pedimos que escriba la contraseña.
    setEmail(acc.email);
    setManualMode(true);
    setTimeout(() => passwordRef.current?.focus(), 0);
  }

  function handleRemoveAccount(uid: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeRecentAccount(uid);
    setRecentAccounts((prev) => prev.filter((a) => a.uid !== uid));
  }

  function handleRecoverAccount() {
    setManualMode(true);
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  function initials(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  }

  async function handleReset() {
    if (!email) { toast.error("Ingresa tu email primero"); return; }
    setResetLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
      toast.success("Revisa tu email — te enviamos el enlace de recuperación");
    } catch {
      toast.error("No encontramos una cuenta con ese email");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("Completa todos los campos"); return; }
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch {
      toast.error("Email o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await signInGoogle();
      router.replace("/dashboard");
    } catch {
      toast.error("Error al iniciar sesión con Google");
    } finally {
      setGoogleLoading(false);
    }
  }

  const inputCls = "w-full pl-9 pr-10 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="min-h-screen flex dark:bg-slate-900">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <Truck size={32} />
          <span className="text-2xl font-bold">LogiAnalytics Pro</span>
        </div>
        <div>
          <blockquote className="text-3xl font-light leading-snug mb-4">
            "Toma decisiones logísticas con datos reales, no con suposiciones."
          </blockquote>
          <p className="text-brand-200 text-sm">
            Dashboard · Inventario · Ventas · Rentabilidad
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          {[["Tiempo real", "Firebase Firestore"], ["Seguro", "Firebase Auth"], ["Escalable", "Cloud Hosting"]].map(([t, s]) => (
            <div key={t} className="bg-white/10 rounded-xl p-3">
              <div className="font-semibold">{t}</div>
              <div className="text-brand-200 text-xs mt-1">{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden bg-slate-50 dark:bg-slate-900">
        {/* Aurora decorativa — sutil, no interactiva */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-20 w-96 h-96 bg-brand-400/25 dark:bg-brand-500/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-fuchsia-300/25 dark:bg-fuchsia-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/2 w-72 h-72 bg-emerald-200/15 dark:bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Truck size={28} className="text-brand-600" />
            <span className="text-xl font-bold text-brand-600">LogiAnalytics Pro</span>
          </div>

          <h1 className="text-3xl font-bold mb-2 dark:text-slate-100 animate-fade-in">Bienvenido de vuelta</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 animate-fade-in">
            {recentAccounts.length > 0 && !manualMode ? "Toca una cuenta para iniciar sesión" : "Ingresa a tu cuenta para continuar"}
          </p>

          {recentAccounts.length > 0 && !manualMode ? (
            <div className="mb-2 rounded-2xl p-[1.5px] bg-gradient-to-br from-brand-300/70 via-fuchsia-200/40 to-emerald-200/50 dark:from-brand-500/50 dark:via-fuchsia-500/20 dark:to-emerald-500/20 shadow-lg shadow-brand-900/10 dark:shadow-black/40">
              <div className="rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2">
                <div>
                  {recentAccounts.map((acc, i) => {
                    const isLoadingThis = quickLoadingUid === acc.uid;
                    const roleMeta = acc.role ? ROLE_BADGE[acc.role] : null;
                    return (
                      <button
                        key={acc.uid}
                        type="button"
                        onClick={() => handleQuickAccount(acc)}
                        disabled={!!quickLoadingUid}
                        style={{ animationDelay: `${i * 60}ms` }}
                        className="animate-account-row group w-full flex items-center gap-4 py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98] transition disabled:cursor-default text-left"
                      >
                        <span className="relative shrink-0">
                          {acc.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={acc.photoURL}
                              alt=""
                              className={`w-14 h-14 rounded-full object-cover ring-2 ${roleMeta?.ring ?? DEFAULT_AVATAR_RING} shadow-sm transition-transform duration-200 group-hover:scale-105`}
                            />
                          ) : (
                            <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${roleMeta?.grad ?? DEFAULT_AVATAR_GRAD} text-white flex items-center justify-center font-semibold text-lg ring-2 ${roleMeta?.ring ?? DEFAULT_AVATAR_RING} shadow-sm transition-transform duration-200 group-hover:scale-105`}>
                              {initials(acc.fullName)}
                            </div>
                          )}
                          {acc.provider === "google.com" && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-slate-800 rounded-full p-1 shadow">
                              <GoogleIcon />
                            </span>
                          )}
                          {isLoadingThis && (
                            <span className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center">
                              <Loader2 size={20} className="text-white animate-spin" />
                            </span>
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium dark:text-slate-100 truncate">{acc.fullName}</span>
                          {roleMeta && (
                            <span className={`inline-block mt-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${roleMeta.cls}`}>
                              {roleMeta.label}
                            </span>
                          )}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleRemoveAccount(acc.uid, e)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRemoveAccount(acc.uid, e as unknown as React.MouseEvent); }}
                          aria-label={`Quitar ${acc.fullName} de este dispositivo`}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1.5 shrink-0"
                        >
                          <X size={16} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-700/60 my-1 mx-2" />

                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  style={{ animationDelay: `${recentAccounts.length * 60}ms` }}
                  className="animate-account-row w-full flex items-center gap-4 py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98] transition text-left"
                >
                  <span className="w-14 h-14 rounded-full border-2 border-dashed border-brand-300 dark:border-brand-500/50 bg-brand-50/60 dark:bg-brand-500/10 flex items-center justify-center text-brand-500 dark:text-brand-300 shrink-0">
                    <Plus size={22} />
                  </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Iniciar sesión en otra cuenta</span>
                </button>

                <button
                  type="button"
                  onClick={handleRecoverAccount}
                  style={{ animationDelay: `${(recentAccounts.length + 1) * 60}ms` }}
                  className="animate-account-row w-full flex items-center gap-4 py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98] transition text-left"
                >
                  <span className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center text-cyan-600 dark:text-cyan-300 shrink-0">
                    <Search size={20} />
                  </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Recuperar tu cuenta</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              {recentAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="text-sm text-brand-600 hover:underline mb-4 inline-block"
                >
                  ← Ver cuentas guardadas
                </button>
              )}

              <button
                onClick={handleGoogle}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 mb-6 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-brand-900/5 hover:border-brand-200 dark:hover:border-brand-500/30 active:scale-[0.99] transition font-medium disabled:opacity-50 dark:text-slate-200"
              >
                <GoogleIcon />
                {googleLoading ? "Conectando…" : "Continuar con Google"}
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-slate-400 text-sm">o con email</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className={labelCls}>Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={emailRef}
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@empresa.com"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className={labelCls}>Contraseña</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={passwordRef}
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetLoading}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-50 transition"
                  >
                    {resetSent ? "Email enviado ✓" : resetLoading ? "Enviando…" : "¿Olvidaste tu contraseña?"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold py-3 rounded-xl hover:shadow-lg hover:shadow-brand-500/30 active:scale-[0.99] transition disabled:opacity-50 disabled:active:scale-100"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> Ingresando…
                    </span>
                  ) : "Ingresar"}
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
            ¿No tienes cuenta?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 font-medium hover:underline">
              Comunícate con nosotros
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
