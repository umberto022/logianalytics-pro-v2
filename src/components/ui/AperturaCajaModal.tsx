"use client";

import { useState } from "react";
import { useCaja } from "@/contexts/CajaContext";
import { fmtCurrency } from "@/lib/utils";
import { Lock, DollarSign, Clock } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  onSkip?: () => void; // allow skipping (user can browse but not sell)
}

export function AperturaCajaModal({ onSkip }: Props) {
  const { openCaja } = useCaja();
  const [initialCash, setInitialCash] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const now   = new Date();
  const fecha = now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const hora  = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  async function handleOpen() {
    const cash = typeof initialCash === "number" ? initialCash : 0;
    if (typeof initialCash === "number" && initialCash <= 0 && initialCash !== 0) {
      toast.error("El monto del fondo debe ser mayor a cero");
      return;
    }
    setSaving(true);
    try {
      await openCaja(cash);
      toast.success(cash > 0 ? `¡Caja abierta con fondo de ${fmtCurrency(cash)}!` : "¡Caja abierta!");
    } catch {
      toast.error("Error al abrir la caja");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden dark:bg-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Apertura de Caja</h2>
          <p className="text-brand-200 text-sm mt-1">Registra el fondo inicial para comenzar</p>
        </div>

        {/* Date/time */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 mb-5 dark:bg-slate-700/40">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Clock size={15} className="text-brand-500" />
              <span className="text-sm font-medium capitalize">{fecha}</span>
            </div>
            <span className="text-sm font-bold text-brand-600 dark:text-brand-300">{hora}</span>
          </div>

          {/* Initial cash */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Fondo de caja inicial
              </label>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full dark:bg-slate-700 dark:text-slate-400">Opcional</span>
            </div>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min={0}
                step="0.01"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Dejar vacío si no hay fondo"
                className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {typeof initialCash === "number" && initialCash > 0
                ? `Fondo registrado: ${fmtCurrency(initialCash)}`
                : "Si no ingresas monto, la caja abre en $0"}
            </p>
          </div>

          <button
            onClick={handleOpen}
            disabled={saving}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Abriendo…</>
              : "Abrir caja y comenzar"}
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-2 transition"
            >
              Ahora no (solo podrás consultar)
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-300 dark:text-slate-500 pb-4">
          Sin apertura de caja no se pueden registrar ventas
        </p>
      </div>
    </div>
  );
}
