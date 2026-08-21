"use client";

import { useState } from "react";
import { MessageSquarePlus, X, Send, Bug, Lightbulb, HelpCircle } from "lucide-react";
import toast from "react-hot-toast";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type FeedbackType = "bug" | "sugerencia" | "pregunta";

const TYPES: { value: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "bug",        label: "Bug",        icon: <Bug size={14} />,         color: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30 dark:hover:bg-red-500/25"      },
  { value: "sugerencia", label: "Sugerencia", icon: <Lightbulb size={14} />,   color: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25" },
  { value: "pregunta",   label: "Pregunta",   icon: <HelpCircle size={14} />,  color: "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 dark:hover:bg-blue-500/25"   },
];

export function FeedbackButton() {
  const { user, profile } = useAuth();
  const [open,    setOpen]    = useState(false);
  const [type,    setType]    = useState<FeedbackType>("sugerencia");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!user || !message.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, "feedback", user.uid, "reports"), {
        type,
        message:   message.trim(),
        userEmail: user.email,
        userName:  profile?.fullName ?? "",
        page:      typeof window !== "undefined" ? window.location.pathname : "",
        createdAt: Timestamp.now(),
      });
      toast.success("¡Gracias por tu feedback!");
      setMessage("");
      setOpen(false);
    } catch {
      toast.error("Error al enviar. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Enviar feedback"
        className="fixed bottom-20 left-4 lg:bottom-6 lg:left-6 z-40 w-11 h-11 bg-white border border-slate-200 shadow-md hover:shadow-lg text-slate-500 hover:text-indigo-600 hover:border-indigo-300 rounded-xl transition-all flex items-center justify-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-indigo-300 dark:hover:border-indigo-500/50"
      >
        <MessageSquarePlus size={18} />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm dark:bg-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <MessageSquarePlus size={17} className="text-indigo-600 dark:text-indigo-400" />
                <span className="font-semibold text-slate-800 text-sm dark:text-slate-100">Enviar feedback</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                <X size={17} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Type selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-slate-400">Tipo</p>
                <div className="flex gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                        type === t.value ? t.color + " border-current" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-slate-400">Mensaje</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    type === "bug"        ? "Describe qué pasó y cómo reproducirlo…" :
                    type === "sugerencia" ? "¿Qué mejorarías o añadirías?" :
                    "¿En qué podemos ayudarte?"
                  }
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
                />
              </div>

              <button
                onClick={submit}
                disabled={sending || !message.trim()}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition"
              >
                {sending ? "Enviando…" : <><Send size={14} /> Enviar</>}
              </button>
              <p className="text-center text-xs text-slate-400">
                Tu feedback nos ayuda a mejorar la app para todos.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
