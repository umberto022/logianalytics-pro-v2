"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, Chrome } from "lucide-react";

export default function LoginPage() {
  const { signIn, signInGoogle, resetPassword } = useAuth();
  const router = useRouter();

  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent,     setResetSent]     = useState(false);
  const [resetLoading,  setResetLoading]  = useState(false);

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

  return (
    <div className="min-h-screen flex">
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

          <h1 className="text-3xl font-bold mb-2">Bienvenido de vuelta</h1>
          <p className="text-slate-500 mb-8">Ingresa a tu cuenta para continuar</p>

          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl py-3 px-4 mb-6 hover:bg-slate-50 transition font-medium disabled:opacity-50"
          >
            <Chrome size={20} />
            {googleLoading ? "Conectando…" : "Continuar con Google"}
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-slate-400 text-sm">o con email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  required
                />
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

          <p className="text-center text-slate-500 text-sm mt-6">
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
