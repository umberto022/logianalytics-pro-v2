"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Zap, Package, Loader2, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { getStripeCheckoutUrl } from "@/lib/stripe";
import { PageHeader } from "@/components/ui/PageHeader";
import toast from "react-hot-toast";

export default function PreciosPage() {
  const { user } = useAuth();
  const { planKey } = usePlan();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("upgrade") === "cancelled";
  const [loading, setLoading] = useState(false);

  function handleUpgrade() {
    if (!user) return;
    const url = getStripeCheckoutUrl(user.uid, user.email ?? "");
    if (!url) {
      toast.error("Pago no configurado aún. Contacta al administrador.");
      return;
    }
    setLoading(true);
    window.location.href = url;
  }

  const freatures = [
    { label: "Hasta 50 productos",            free: true,  pro: true  },
    { label: "Productos ilimitados",           free: false, pro: true  },
    { label: "Dashboard y KPIs",              free: true,  pro: true  },
    { label: "Módulo Ventas",                 free: true,  pro: true  },
    { label: "Módulo Compras",                free: true,  pro: true  },
    { label: "Módulo Inventario",             free: true,  pro: true  },
    { label: "Exportar CSV",                  free: true,  pro: true  },
    { label: "Exportar PDF",                  free: false, pro: true  },
    { label: "Módulo Rentabilidad",           free: false, pro: true  },
    { label: "Módulo Rutas avanzadas",        free: false, pro: true  },
    { label: "Notificaciones de stock",       free: false, pro: true  },
    { label: "Soporte prioritario",           free: false, pro: true  },
  ];

  return (
    <div>
      <PageHeader
        title="Planes"
        subtitle="Elige el plan que mejor se adapte a tu negocio"
      />

      {cancelled && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          El pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {/* Free */}
        <div className={`bg-white rounded-2xl border-2 p-6 shadow-sm ${planKey === "free" ? "border-brand-500" : "border-slate-100"}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Package size={18} className="text-slate-500" />
                <h2 className="text-lg font-bold text-slate-900">Free</h2>
              </div>
              <p className="text-slate-500 text-sm">Para empezar</p>
            </div>
            {planKey === "free" && (
              <span className="px-2.5 py-1 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">
                Tu plan actual
              </span>
            )}
          </div>
          <div className="mb-5">
            <span className="text-3xl font-bold text-slate-900">$0</span>
            <span className="text-slate-400 text-sm ml-1">/ mes</span>
          </div>
          <ul className="space-y-2.5 mb-6">
            {freatures.filter(f => f.free).map(f => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm text-slate-600">
                <Check size={14} className="text-emerald-500 flex-shrink-0" />
                {f.label}
              </li>
            ))}
            {freatures.filter(f => !f.free).map(f => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm text-slate-300 line-through">
                <span className="w-3.5 h-3.5 flex-shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>
          <button disabled
            className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-400 cursor-default">
            Plan actual
          </button>
        </div>

        {/* Pro */}
        <div className={`bg-white rounded-2xl border-2 p-6 shadow-sm relative overflow-hidden ${planKey === "pro" ? "border-emerald-500" : "border-brand-500"}`}>
          {planKey !== "pro" && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-brand-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <Star size={11} /> Recomendado
            </div>
          )}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={18} className="text-brand-500" />
                <h2 className="text-lg font-bold text-slate-900">Pro</h2>
              </div>
              <p className="text-slate-500 text-sm">Para negocios en crecimiento</p>
            </div>
            {planKey === "pro" && (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                Tu plan actual
              </span>
            )}
          </div>
          <div className="mb-5">
            <span className="text-3xl font-bold text-slate-900">$19</span>
            <span className="text-slate-400 text-sm ml-1">/ mes</span>
            <p className="text-xs text-slate-400 mt-0.5">Sin contratos · Cancela cuando quieras</p>
          </div>
          <ul className="space-y-2.5 mb-6">
            {freatures.map(f => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm text-slate-700">
                <Check size={14} className={`flex-shrink-0 ${f.free ? "text-emerald-500" : "text-brand-500"}`} />
                {f.label}
                {!f.free && <span className="ml-auto text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">PRO</span>}
              </li>
            ))}
          </ul>
          {planKey === "pro" ? (
            <button disabled
              className="w-full py-2.5 rounded-xl border-2 border-emerald-200 text-sm font-semibold text-emerald-600 cursor-default">
              ✓ Activo
            </button>
          ) : (
            <button onClick={handleUpgrade} disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {loading ? "Redirigiendo…" : "Activar Pro — $19/mes"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400 max-w-xl">
        El pago se procesa de forma segura a través de Stripe. Aceptamos todas las tarjetas de crédito y débito principales.
        Puedes cancelar tu suscripción en cualquier momento desde Configuración.
      </p>
    </div>
  );
}
