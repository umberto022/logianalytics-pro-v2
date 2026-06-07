"use client";

import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["V"], desc: "Abrir venta rápida" },
  { keys: ["?"], desc: "Mostrar atajos de teclado" },
  { keys: ["Esc"], desc: "Cerrar modal activo" },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-brand-600" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Atajos de teclado</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono rounded border border-slate-200 dark:border-slate-600 font-semibold shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-5 text-center">Los atajos funcionan cuando no hay un input activo</p>
      </div>
    </div>
  );
}
