"use client";

import { useState } from "react";
import { X, Zap, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getStripeCheckoutUrl } from "@/lib/stripe";
import toast from "react-hot-toast";

interface Props {
  reason?: string;
  onClose: () => void;
}

export function UpgradeModal({ reason, onClose }: Props) {
  const { user } = useAuth();
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

  const features = [
    "Productos ilimitados",
    "Exportar PDF e informes",
    "Módulo Rentabilidad",
    "Módulo Rutas avanzadas",
    "Soporte prioritario",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-700 to-brand-500 p-6 text-white relative">
          <button onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={20} className="text-yellow-300" />
            <span className="text-sm font-semibold uppercase tracking-wide text-brand-200">LogiAnalytics Pro</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Upgrade a Pro</h2>
          {reason && <p className="text-brand-200 text-sm">{reason}</p>}
        </div>

        {/* Price */}
        <div className="px-6 pt-5 pb-3 text-center border-b border-slate-100">
          <span className="text-4xl font-bold text-slate-900">$19</span>
          <span className="text-slate-400 text-sm ml-1">/ mes</span>
          <p className="text-xs text-slate-400 mt-1">Cancela cuando quieras · Sin contratos</p>
        </div>

        {/* Features */}
        <ul className="px-6 py-4 space-y-2.5">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check size={12} className="text-emerald-600" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button onClick={handleUpgrade} disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
            {loading ? "Redirigiendo…" : "Activar Pro ahora — $19/mes"}
          </button>
          <button onClick={onClose} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 mt-3 transition">
            Continuar con Free
          </button>
        </div>
      </div>
    </div>
  );
}
