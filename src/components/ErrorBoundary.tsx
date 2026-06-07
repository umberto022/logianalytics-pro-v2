"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props  { children: ReactNode }
interface State  { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Algo salió mal
          </h2>
          <p className="text-sm text-slate-500 mb-1">
            Ocurrió un error inesperado en la aplicación.
          </p>
          {this.state.message && (
            <p className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-3 py-2 mt-3 mb-5 text-left break-all">
              {this.state.message}
            </p>
          )}
          <div className="flex gap-3 justify-center mt-5">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition"
            >
              <RefreshCw size={14} />
              Reintentar
            </button>
            <button
              onClick={() => window.location.assign("/")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
