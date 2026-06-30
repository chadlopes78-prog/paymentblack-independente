import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Clock, LogOut } from "lucide-react";
import { isAdminEmail } from "@/lib/admins";

export const Route = createFileRoute("/waiting-approval")({
  component: WaitingApprovalPage,
});

function WaitingApprovalPage() {
  const [status, setStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", session.user.id)
        .single();

      if (isAdminEmail(session.user.email) || profile?.status === "approved") {
        navigate({ to: "/dashboard" });
      } else if (profile?.status === "banned" || profile?.status === "rejected") {
        navigate({ to: "/blocked" });
      } else {
        setStatus(profile?.status || "pending");
      }
    };

    checkStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/auth" });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-6">
          <Clock className="h-10 w-10" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Aguardando Aprovação</h1>
          <p className="text-slate-600 leading-relaxed">
            Sua conta foi criada com sucesso! Para garantir a segurança da plataforma, novos usuários passam por uma revisão manual.
          </p>
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-sm text-slate-500 shadow-sm italic">
            "Normalmente aprovamos novas contas em menos de 24 horas."
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            variant="outline" 
            className="w-full border-slate-200" 
            onClick={() => window.location.reload()}
          >
            Verificar Status
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-slate-500 hover:text-red-600" 
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
