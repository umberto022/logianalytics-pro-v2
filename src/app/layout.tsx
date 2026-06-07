import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "react-hot-toast";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryProvider } from "@/components/QueryProvider";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4f46e5",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "LogiAnalytics Pro — Gestión logística en tiempo real",
  description:
    "Gestiona inventario, ventas, compras y rentabilidad de tu negocio en una sola plataforma. Datos en tiempo real, desde cualquier dispositivo.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LogiPro",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "LogiAnalytics Pro — Gestión logística en tiempo real",
    description:
      "Inventario, ventas, compras y rentabilidad en una sola plataforma. En tiempo real, desde cualquier dispositivo.",
    type: "website",
    locale: "es_LA",
    siteName: "LogiAnalytics Pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "LogiAnalytics Pro",
    description:
      "Gestión logística y analítica para negocios latinoamericanos. Gratis para empezar.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <ErrorBoundary>
        <QueryProvider>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: "10px",
                background: "#1e293b",
                color: "#f1f5f9",
              },
            }}
          />
        </AuthProvider>
        </QueryProvider>
        </ErrorBoundary>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
