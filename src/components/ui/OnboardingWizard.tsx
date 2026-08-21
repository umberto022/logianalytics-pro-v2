"use client";

import { useState } from "react";
import {
  Truck, Package, ShoppingCart, TrendingUp, Users,
  ArrowRight, CheckCircle2, Sparkles, Building2, MapPin,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { completeOnboarding } from "@/lib/firestore/users";
import { seedDemoData } from "@/lib/firestore/seedDemo";
import toast from "react-hot-toast";
import { INDUSTRIES, COUNTRIES } from "@/types";

const MODULES = [
  { icon: Package,      color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",  title: "Inventario",  desc: "Gestiona productos, stock y alertas de reabastecimiento." },
  { icon: ShoppingCart, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", title: "Ventas",      desc: "Registra pedidos, genera facturas y analiza ingresos." },
  { icon: Truck,        color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",     title: "Compras",     desc: "Órdenes de compra, recepción de mercancía y proveedores." },
  { icon: TrendingUp,   color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",   title: "Reportes",   desc: "Dashboard, rentabilidad por ruta y análisis de margen." },
  { icon: Users,        color: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",       title: "Clientes",   desc: "Base de clientes con historial de ventas y créditos." },
  { icon: MapPin,       color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",       title: "Rutas",      desc: "Mapa de rutas de entrega con métricas de rendimiento." },
];

interface Props {
  onDone: () => void;
}

export function OnboardingWizard({ onDone }: Props) {
  const { user, refreshProfile } = useAuth();
  const { workspaceId } = useRole();
  const [step,        setStep]        = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry,    setIndustry]    = useState("");
  const [country,     setCountry]     = useState("");
  const [loadDemo,    setLoadDemo]    = useState(false);
  const [saving,      setSaving]      = useState(false);

  async function finish() {
    if (!user) return;
    setSaving(true);
    try {
      await completeOnboarding(user.uid, { companyName, industry, country });
      if (loadDemo) {
        await seedDemoData(workspaceId);
        toast.success("Datos de demo cargados. ¡Explora la app!");
      } else {
        toast.success("¡Bienvenido a LogiAnalytics!");
      }
      await refreshProfile();
      onDone();
    } catch {
      toast.error("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden dark:bg-slate-800">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <Truck size={30} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">¡Bienvenido a LogiAnalytics!</h1>
                <p className="text-slate-500 mt-2 leading-relaxed dark:text-slate-400">
                  Tu plataforma de gestión logística lista para usar. En 2 minutos configuramos todo para ti.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 text-left space-y-3 dark:bg-slate-700/40">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide dark:text-slate-400">
                    Nombre de tu empresa
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ej. Distribuidora El Sol"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide dark:text-slate-400">
                      Industria
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Seleccionar…</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide dark:text-slate-400">
                      País
                    </label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Seleccionar…</option>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                Continuar <ArrowRight size={16} />
              </button>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                Saltar configuración
              </button>
            </div>
          )}

          {/* Step 1 — Module tour */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3 dark:bg-amber-500/15">
                  <Sparkles size={22} className="text-amber-600 dark:text-amber-300" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Todo lo que puedes hacer</h2>
                <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">6 módulos integrados para gestionar tu negocio completo</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {MODULES.map(({ icon: Icon, color, title, desc }) => (
                  <div key={title} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 dark:bg-slate-700/40 dark:border-slate-700">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                      <Icon size={16} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed dark:text-slate-400">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition text-sm"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-[2] bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2 text-sm"
                >
                  Siguiente <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Done */}
          {step === 2 && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto dark:bg-emerald-500/15">
                <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">¡Todo listo!</h2>
                <p className="text-slate-500 mt-2 leading-relaxed dark:text-slate-400">
                  {companyName ? `${companyName} está configurada.` : "Tu cuenta está lista."}{" "}
                  Empieza añadiendo tus primeros productos al inventario.
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-left space-y-2 dark:bg-indigo-500/10 dark:border-indigo-500/30">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2 dark:text-indigo-300">Primeros pasos recomendados</p>
                {[
                  "Añade tus productos en Inventario",
                  "Registra tus proveedores",
                  "Crea tu primera venta",
                  "Revisa el Dashboard de análisis",
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{tip}</span>
                  </div>
                ))}
              </div>

              {/* Demo data toggle */}
              <button
                onClick={() => setLoadDemo((v) => !v)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition text-left ${
                  loadDemo
                    ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/15"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                  loadDemo ? "bg-indigo-600 border-indigo-600" : "border-slate-300 dark:border-slate-600"
                }`}>
                  {loadDemo && <CheckCircle2 size={12} className="text-white" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cargar datos de demostración</p>
                  <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">8 productos, 3 proveedores, 4 clientes y ventas de 4 semanas para explorar la app desde el inicio.</p>
                </div>
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition text-sm"
                >
                  Atrás
                </button>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                >
                  {saving ? (loadDemo ? "Cargando demo…" : "Guardando…") : "Ir al Dashboard →"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${s === step ? "w-6 bg-indigo-500" : "w-1.5 bg-slate-200 dark:bg-slate-700"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
