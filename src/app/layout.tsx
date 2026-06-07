import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "react-hot-toast";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  title: "LogiAnalytics Pro",
  description: "Plataforma de analítica logística para tu empresa",
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <ErrorBoundary>
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
        </ErrorBoundary>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
