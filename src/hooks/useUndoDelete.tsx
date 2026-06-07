"use client";

import toast from "react-hot-toast";

const DELAY = 5000;

export function useUndoDelete() {
  return function undoDelete(label: string, onConfirm: () => Promise<void>) {
    let cancelled = false;

    const toastId = toast.custom(
      (t) => (
        <div
          className={`flex items-center gap-3 px-4 py-3 bg-slate-800 text-white rounded-xl shadow-lg transition-all ${
            t.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <span className="text-lg">🗑️</span>
          <span className="text-sm flex-1">{label}</span>
          <button
            onClick={() => {
              cancelled = true;
              toast.dismiss(t.id);
              toast("Eliminación cancelada", { icon: "↩️", duration: 2000 });
            }}
            className="text-xs font-bold text-brand-300 hover:text-white underline whitespace-nowrap ml-2"
          >
            Deshacer
          </button>
        </div>
      ),
      { duration: DELAY }
    );

    setTimeout(async () => {
      if (!cancelled) {
        toast.dismiss(toastId);
        await onConfirm();
      }
    }, DELAY);
  };
}
