"use client";

import { useRouter } from "next/navigation";
import { useCaja } from "@/contexts/CajaContext";
import { AlertTriangle, X, ArrowRight } from "lucide-react";

export function CajaAbiertaModal() {
  const { cancelLogout, confirmLogout } = useCaja();
  const router = useRouter();

  function goToCierre() {
    cancelLogout();
    router.push("/ventas?tab=cierre");
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Caja abierta</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Debes realizar el cierre antes de salir</p>
            </div>
          </div>
          <button onClick={cancelLogout} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
          Tienes una caja abierta. Para cerrar sesión correctamente debes hacer el <strong>cierre de caja</strong> primero, cuadrando el efectivo del día.
        </p>

        <div className="space-y-2">
          <button
            onClick={goToCierre}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition"
          >
            Ir a Cierre de caja <ArrowRight size={16} />
          </button>
          <button
            onClick={confirmLogout}
            className="w-full text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 py-2 transition"
          >
            Salir de todas formas (sin cerrar)
          </button>
        </div>
      </div>
    </div>
  );
}
