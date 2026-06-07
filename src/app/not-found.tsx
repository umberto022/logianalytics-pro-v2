import Link from "next/link";
import { Truck, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-brand-50 dark:bg-brand-900/30 rounded-2xl flex items-center justify-center">
            <Truck size={40} className="text-brand-600" />
          </div>
        </div>
        <h1 className="text-7xl font-extrabold text-brand-600 mb-2">404</h1>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">
          Página no encontrada
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          La ruta que buscas no existe o fue movida. Vuelve al dashboard para continuar.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl transition"
          >
            <Home size={16} /> Ir al dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft size={16} /> Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
