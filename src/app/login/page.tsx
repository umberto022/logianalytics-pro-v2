"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, Eye, EyeOff, X, Plus, Search } from "lucide-react";
import { getRecentAccounts, removeRecentAccount, type RecentAccount } from "@/lib/recentAccounts";

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
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentAccounts(getRecentAccounts());
  }, []);

  function handleQuickAccount(acc: RecentAccount) {
    if (acc.provider === "google.com") {
      handleGoogle();
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
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Truck size={28} className="text-brand-600" />
            <span className="text-xl font-bold text-brand-600">LogiAnalytics Pro</span>
          </div>

          <h1 className="text-3xl font-bold mb-2 dark:text-slate-100">Bienvenido de vuelta</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            {recentAccounts.length > 0 && !manualMode ? "Toca una cuenta para iniciar sesión" : "Ingresa a tu cuenta para continuar"}
          </p>

          {recentAccounts.length > 0 && !manualMode ? (
            <div className="mb-2">
              <div className="mb-2">
                {recentAccounts.map((acc) => (
                  <button
                    key={acc.uid}
                    type="button"
                    onClick={() => handleQuickAccount(acc)}
                    className="group w-full flex items-center gap-4 py-2.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                  >
                    <span className="relative shrink-0">
                      {acc.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={acc.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 flex items-center justify-center font-semibold text-lg">
                          {initials(acc.fullName)}
                        </div>
                      )}
                      {acc.provider === "google.com" && (
                        <span className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-slate-800 rounded-full p-1 shadow">
                          <GoogleIcon />
                        </span>
                      )}
                    </span>
                    <span className="flex-1 min-w-0 font-medium dark:text-slate-100 truncate">{acc.fullName}</span>
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
                ))}
              </div>

              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="w-full flex items-center gap-4 py-2.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
              >
                <span className="w-14 h-14 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 shrink-0">
                  <Plus size={22} />
                </span>
                <span className="font-medium text-slate-600 dark:text-slate-300">Iniciar sesión en otra cuenta</span>
              </button>

              <button
                type="button"
                onClick={handleRecoverAccount}
                className="w-full flex items-center gap-4 py-2.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center text-slate-400 shrink-0">
                  <Search size={20} />
                </span>
                <span className="font-medium text-slate-600 dark:text-slate-300">Recuperar tu cuenta</span>
              </button>
            </div>
          ) : (
            <>
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
                className="w-full flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 mb-6 hover:bg-slate-50 dark:hover:bg-slate-800 transition font-medium disabled:opacity-50 dark:text-slate-200"
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
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
                >
                  {loading ? "Ingresando…" : "Ingresar"}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-brand-600 font-medium hover:underline">
              Crear cuenta gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
