import Link from "next/link";
import { Truck, ArrowLeft } from "lucide-react";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <header className="border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <Truck size={17} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-none">LogiAnalytics</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
          >
            <ArrowLeft size={15} /> Volver al inicio
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-14">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-2">{title}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-10">Última actualización: {LEGAL_LAST_UPDATED}</p>
        <div>{children}</div>
      </main>

      <footer className="py-8 px-4 bg-slate-900 text-center">
        <p className="text-slate-500 text-sm">LogiAnalytics Pro — Gestión logística y analítica para negocios</p>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2.5">{title}</h2>
      <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
