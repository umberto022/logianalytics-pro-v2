"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";

interface Props {
  isOpen:      boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  danger?:     boolean;
  loading?:    boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

export function ConfirmModal({
  isOpen, title, description,
  confirmLabel = "Confirmar",
  danger = false,
  loading = false,
  onConfirm, onCancel,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
          danger ? "bg-red-50 dark:bg-red-500/15" : "bg-amber-50 dark:bg-amber-500/15"
        }`}>
          {danger
            ? <Trash2 size={22} className="text-red-500 dark:text-red-400" />
            : <AlertTriangle size={22} className="text-amber-500 dark:text-amber-400" />}
        </div>

        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{description}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50 ${
              danger
                ? "bg-red-500 hover:bg-red-600"
                : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {loading ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
