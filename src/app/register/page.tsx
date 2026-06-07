"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, User, Phone } from "lucide-react";

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

export default function RegisterPage() {
  const { register, signInGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", password: "", confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [user, authLoading, router]);

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await signInGoogle();
      router.replace("/dashboard");
    } catch {
      toast.error("Error al continuar con Google");
    } finally {
      setGoogleLoading(false);
    }
  }

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { fullName, email, phone, password, confirm } = form;
    if (!fullName || !email || !password || !confirm) {
      toast.error("Completa todos los campos obligatorios"); return;
    }
    if (password !== confirm) { toast.error("Las contraseñas no coinciden"); return; }
    if (password.length < 6)  { toast.error("Contraseña mínimo 6 caracteres"); return; }

    setLoading(true);
    try {
      await register(email, password, fullName, phone);
      toast.success("¡Cuenta creada exitosamente!");
      router.replace("/dashboard");
    } catch (e: unknown) {
      const msg = (e as { code?: string }).code === "auth/email-already-in-use"
        ? "El email ya está registrado"
        : "Error al crear la cuenta";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="flex items-center gap-2 mb-8">
          <Truck size={28} className="text-brand-600" />
          <span className="text-xl font-bold text-brand-600">LogiAnalytics Pro</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Crear cuenta gratis</h1>
        <p className="text-slate-500 mb-6 text-sm">Sin tarjeta de crédito requerida</p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl py-3 px-4 mb-4 hover:bg-slate-50 transition font-medium disabled:opacity-50"
        >
          <GoogleIcon />
          {googleLoading ? "Conectando…" : "Continuar con Google"}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-slate-400 text-sm">o con email</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={form.fullName} onChange={set("fullName")}
                  placeholder="Ana García"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email" value={form.email} onChange={set("email")}
                  placeholder="ana@empresa.com"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={form.phone} onChange={set("phone")}
                  placeholder="+58 412 000 0000"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password" value={form.password} onChange={set("password")}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password" value={form.confirm} onChange={set("confirm")}
                  placeholder="Repite la contraseña"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-2"
          >
            {loading ? "Creando cuenta…" : "Crear cuenta gratis"}
          </button>
        </form>

        <p className="text-center text-slate-500 text-sm mt-4">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-brand-600 font-medium hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
