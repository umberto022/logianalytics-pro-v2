"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, User, Phone } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", password: "", confirm: "",
  });
  const [loading, setLoading] = useState(false);

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
