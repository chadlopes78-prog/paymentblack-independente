import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    reportLovableError(error, { componentStack: errorInfo.componentStack });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center space-y-6">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-10 w-10" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Ops! Algo deu errado.</h1>
              <p className="text-slate-500 font-medium">
                Ocorreu um erro inesperado na aplicação. Nossa equipe foi notificada.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <pre className="mt-4 p-4 bg-slate-100 rounded-lg text-left text-xs overflow-auto max-h-40 text-red-800">
                  {this.state.error?.message}
                </pre>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => window.location.reload()} 
                className="w-full h-12 font-bold shadow-lg shadow-primary/20"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Tentar Novamente
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/'}
                className="w-full h-12 font-bold border-slate-200"
              >
                <Home className="mr-2 h-4 w-4" />
                Voltar ao Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
