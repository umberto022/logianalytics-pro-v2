import type { Metadata } from "next";
import Link from "next/link";
import {
  Truck, BarChart3, Package, ShoppingCart, TrendingUp,
  MapPin, ClipboardList, ArrowRight, CheckCircle,
  Zap, Shield, Users, Star,
} from "lucide-react";
import { LandingInstallButtonHeader, LandingInstallButtonHero } from "@/components/ui/LandingInstallButton";

export const metadata: Metadata = {
  title: "LogiAnalytics Pro — Gestión logística para negocios",
  description:
    "Gestiona inventario, ventas, compras y rentabilidad en una sola plataforma. Datos en tiempo real, desde cualquier dispositivo. Hecho para negocios latinoamericanos.",
  openGraph: {
    title: "LogiAnalytics Pro — Gestión logística para negocios",
    description:
      "Inventario, ventas, compras y rentabilidad en una sola plataforma. En tiempo real, desde cualquier dispositivo.",
    type: "website",
    locale: "es_LA",
    siteName: "LogiAnalytics Pro",
    url: "https://logianalytics-pro-v2.vercel.app",
    images: [{ url: "https://logianalytics-pro-v2.vercel.app/icon-512.png", width: 512, height: 512, alt: "LogiAnalytics Pro" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LogiAnalytics Pro — Gestión logística para negocios",
    description: "Gestión logística y analítica para negocios latinoamericanos. Gratis para empezar.",
    images: ["https://logianalytics-pro-v2.vercel.app/icon-512.png"],
  },
};

const FEATURES = [
  { icon: BarChart3,    color: "bg-blue-50 text-blue-600",     title: "Dashboard en tiempo real",    desc: "KPIs de ingresos, ganancias, margen y ventas actualizados al instante." },
  { icon: Package,      color: "bg-emerald-50 text-emerald-600", title: "Inventario inteligente",    desc: "Control de stock, alertas automáticas, historial de movimientos y códigos QR." },
  { icon: ShoppingCart, color: "bg-purple-50 text-purple-600", title: "Gestión de ventas",           desc: "Registro rápido, facturación con NCF, estados de pago y análisis por cliente." },
  { icon: ClipboardList,color: "bg-orange-50 text-orange-600", title: "Órdenes de compra",           desc: "Seguimiento de pedidos a proveedores, recepciones parciales y documentación." },
  { icon: TrendingUp,   color: "bg-rose-50 text-rose-600",     title: "Análisis de rentabilidad",   desc: "Margen por producto, ruta y cliente. Identifica qué te genera más ganancia." },
  { icon: MapPin,       color: "bg-teal-50 text-teal-600",     title: "Rutas de distribución",      desc: "Visualiza y analiza el rendimiento de tus rutas en un mapa interactivo." },
];

const BENEFITS = [
  "Acceso desde cualquier dispositivo — web, tablet o celular",
  "Sin instalaciones — funciona directo en el navegador",
  "Datos en tiempo real con sincronización automática",
  "Interfaz en español diseñada para negocios latinoamericanos",
  "Exporta reportes en PDF y CSV con un clic",
  "Alertas automáticas cuando el stock está bajo",
];

const BETA_PERKS = [
  { icon: Zap,    title: "Acceso 100% gratuito",    desc: "Durante toda la fase beta, sin límites ni tarjeta." },
  { icon: Star,   title: "Moldea el producto",       desc: "Tu feedback directo define las próximas funciones." },
  { icon: Shield, title: "Datos seguros",            desc: "Firebase con backups automáticos y reglas de seguridad." },
  { icon: Users,  title: "Soporte prioritario",      desc: "Acceso directo al equipo para resolver cualquier duda." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Beta top banner */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center py-2.5 px-4 text-sm font-semibold">
        🚀 Versión Beta — Acceso anticipado gratuito · Sin tarjeta · Sin límites
        <Link href="/register" className="ml-3 underline underline-offset-2 hover:no-underline opacity-90">
          Únete ahora →
        </Link>
      </div>

      {/* Header */}
      <header className="sticky top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <Truck size={17} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg leading-none">LogiAnalytics</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 leading-none">BETA</span>
          </div>
          <div className="flex items-center gap-2">
            <LandingInstallButtonHeader />
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              Ingresar
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition shadow-sm"
            >
              Acceso Beta →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 pb-24 px-4 text-center bg-gradient-to-b from-slate-50 via-slate-50 to-white">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block mb-5 text-xs font-bold tracking-widest text-amber-700 uppercase bg-amber-50 border border-amber-200 px-4 py-1.5 rounded-full">
            ✦ Acceso anticipado — Únete al beta gratuito
          </span>
          <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
            Toma decisiones con{" "}
            <span className="text-brand-600 relative">
              datos reales
              <span className="absolute inset-x-0 -bottom-1 h-1 bg-brand-200 rounded-full" />
            </span>
          </h1>
          <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Gestiona inventario, ventas, compras y rentabilidad de tu negocio
            en una sola plataforma. En tiempo real, desde cualquier dispositivo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold px-8 py-4 rounded-xl text-base transition shadow-lg shadow-brand-600/25 active:scale-95"
            >
              Empezar gratis <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 border-2 border-slate-200 text-slate-700 font-semibold px-8 py-4 rounded-xl text-base hover:border-brand-300 hover:bg-brand-50 transition"
            >
              Ya tengo cuenta
            </Link>
          </div>
          <LandingInstallButtonHero />

          {/* Social proof */}
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-400">
            <div className="flex -space-x-2">
              {["bg-indigo-400","bg-emerald-400","bg-amber-400","bg-rose-400"].map((c,i) => (
                <div key={i} className={`w-7 h-7 rounded-full border-2 border-white ${c} flex items-center justify-center text-white text-[10px] font-bold`}>
                  {["A","M","C","R"][i]}
                </div>
              ))}
            </div>
            <span>Beta testers activos usando la plataforma</span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-16 max-w-2xl mx-auto grid grid-cols-3 gap-6">
          {[
            { value: "Tiempo real", label: "Actualización de datos" },
            { value: "100%",        label: "En la nube y gratis en beta" },
            { value: "PWA",         label: "Instálala en tu celular" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-extrabold text-brand-600 mb-1">{value}</div>
              <div className="text-xs text-slate-400 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Beta access section */}
      <section className="py-20 px-4 bg-gradient-to-br from-brand-900 via-brand-800 to-indigo-900 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold tracking-widest text-amber-300 uppercase bg-amber-400/10 border border-amber-400/20 px-4 py-1.5 rounded-full mb-4">
              Versión Beta
            </span>
            <h2 className="text-3xl font-extrabold mb-3">¿Qué incluye el acceso beta?</h2>
            <p className="text-brand-200 text-lg max-w-xl mx-auto">
              Los primeros usuarios moldean el producto. Sin costo, sin límites, con soporte directo.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
            {BETA_PERKS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/10 border border-white/10 rounded-2xl p-5 backdrop-blur-sm hover:bg-white/15 transition">
                <div className="w-10 h-10 bg-brand-500/30 rounded-xl flex items-center justify-center mb-3">
                  <Icon size={20} className="text-brand-200" />
                </div>
                <p className="font-semibold text-white mb-1">{title}</p>
                <p className="text-sm text-brand-200 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white text-brand-700 font-bold px-10 py-4 rounded-xl text-base hover:bg-brand-50 transition shadow-xl active:scale-95"
            >
              Unirme al beta gratuito <ArrowRight size={18} />
            </Link>
            <p className="mt-3 text-brand-300 text-sm">Sin tarjeta · Sin compromisos · Cancela cuando quieras</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Todo lo que necesitas</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Módulos diseñados para negocios de distribución y logística
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-2xl border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 bg-white"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon size={22} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2 text-base">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-3">¿Por qué LogiAnalytics?</h2>
            <p className="text-slate-500 text-lg">Simple, potente y hecho para tu tipo de negocio</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {BENEFITS.map((item) => (
              <div key={item} className="flex items-start gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <CheckCircle size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
                <span className="text-slate-700 text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Empieza en 2 minutos</h2>
          <p className="text-slate-500 text-lg mb-14">Sin configuraciones complicadas</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Crea tu cuenta",      desc: "Regístrate gratis con tu email o Google. Sin tarjeta requerida." },
              { step: "2", title: "Configura tu negocio", desc: "Asistente de bienvenida te guía. Puedes cargar datos de demo para explorar." },
              { step: "3", title: "Toma decisiones",      desc: "Dashboard con datos reales de tus ventas, stock y rentabilidad." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white font-extrabold text-xl flex items-center justify-center mb-4 shadow-lg shadow-brand-600/25">
                  {step}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-24 px-4 bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block text-xs font-bold tracking-widest text-amber-300 uppercase bg-amber-400/10 border border-amber-400/20 px-4 py-1.5 rounded-full mb-6">
            Acceso beta gratuito
          </span>
          <h2 className="text-4xl font-extrabold mb-4">¿Listo para empezar?</h2>
          <p className="text-brand-100 text-lg mb-10 leading-relaxed">
            Únete al beta y comienza a gestionar tu negocio hoy mismo. Gratis, sin límites, sin tarjeta.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-bold px-10 py-4 rounded-xl text-lg hover:bg-brand-50 transition shadow-xl active:scale-95"
          >
            Crear cuenta gratis <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-slate-900 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Truck size={16} className="text-brand-400" />
          <span className="text-white font-bold">LogiAnalytics</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 border border-amber-400/30">BETA</span>
        </div>
        <p className="text-slate-500 text-sm">Plataforma de gestión logística y analítica para negocios</p>
        <p className="text-slate-600 text-xs mt-2">pedromateo.desarrollo@gmail.com</p>
      </footer>
    </div>
  );
}
